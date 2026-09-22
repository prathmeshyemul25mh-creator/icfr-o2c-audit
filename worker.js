const MODEL = 'gemini-3.8-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MODEL_INFO_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`;

function getApiKey(env) {
  const raw = env?.GEMINI_API_KEY;
  if (!raw) return null;
  const key = String(raw).trim().replace(/^['"]|['"]$/g, '');
  return key || null;
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = String(text || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(fenced);
  }
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function callGemini(body, key) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || 'Gemini API request failed';
    const error = new Error(message);
    error.status = response.status;
    error.reason = payload?.error?.status || payload?.error?.details?.[0]?.reason || null;
    throw error;
  }

  return payload;
}

async function handleGemini(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  const key = getApiKey(env);

  if (!key) {
    return jsonResponse({
      error: 'GEMINI_API_KEY is missing in Cloudflare Variables and Secrets.',
      category: 'CONFIGURATION'
    }, 500);
  }

  try {
    const input = await request.json();

    if (input.mode === 'health') {
      const response = await fetch(MODEL_INFO_ENDPOINT, {
        headers: { 'x-goog-api-key': key }
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return jsonResponse({
          ok: false,
          error: payload?.error?.message || 'Gemini authentication/model check failed',
          category: response.status === 400 || response.status === 401 ? 'AUTHENTICATION' : 'GEMINI_API',
          provider_status: response.status
        }, response.status);
      }

      return jsonResponse({
        ok: true,
        model: payload?.name || MODEL,
        message: 'Gemini API key accepted and model is reachable.'
      });
    }

    if (input.mode === 'invoice_extract') {
      if (!input.url) {
        return jsonResponse({ error: 'Signed invoice URL is required' }, 400);
      }

      const pdf = await fetch(input.url);
      if (!pdf.ok) {
        throw new Error('Could not fetch invoice PDF from Supabase storage');
      }

      const bytes = new Uint8Array(await pdf.arrayBuffer());
      const base64 = uint8ToBase64(bytes);
      const prompt = `Read this hotel invoice and extract ONLY these fields. Do not guess or infer missing values. If a field is not visible, return null. Return valid JSON only with these exact keys: invoice_number, invoice_date (YYYY-MM-DD if visible), customer_name, guest_name, gstin, taxable_amount, cgst, sgst, igst, total_amount. The extracted data will be used for deterministic audit verification.`;

      const payload = await callGemini({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      }, key);

      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let invoice;
      try {
        invoice = parseJsonText(text);
      } catch {
        throw new Error('Gemini did not return valid invoice JSON');
      }

      return jsonResponse({ invoice, model: MODEL });
    }

    const prompt = `You are an audit-assistance AI for an ICFR O2C transaction-testing platform.
Use ONLY the supplied company RCM, deterministic testing results, and recorded exceptions.
Do not invent facts. Preserve company control codes exactly.
Do not declare a control ineffective and do not make the final audit conclusion.
Identify:
1) risks implicated by observed exceptions,
2) related company controls,
3) evidence supporting each assessment,
4) controls that may require reassessment,
5) potential strengthening of existing controls,
6) potential new controls.
Return JSON with keys executive_summary, risk_findings[], control_improvements[].

COMPANY RCM:
${JSON.stringify(input.controls || [])}

TESTS:
${JSON.stringify(input.tests || [])}

EXCEPTIONS:
${JSON.stringify(input.exceptions || [])}

SAMPLES:
${JSON.stringify(input.samples || [])}`;

    const payload = await callGemini({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    }, key);

    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let analysis;

    try {
      analysis = parseJsonText(text);
    } catch {
      analysis = {
        executive_summary: text,
        risk_findings: [],
        control_improvements: []
      };
    }

    return jsonResponse({ analysis, model: MODEL });
  } catch (e) {
    const status = e?.status || 500;
    const category = e?.reason === 'API_KEY_INVALID' || status === 400 || status === 401
      ? 'AUTHENTICATION'
      : 'GEMINI_API';

    return jsonResponse({
      error: e?.message || 'AI function error',
      category,
      provider_status: status
    }, status);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/gemini') {
      return handleGemini(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
