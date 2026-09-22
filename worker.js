const ANALYSIS_MODEL = 'gemini-3.8-flash';

const INVOICE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite'
];

const ANALYSIS_FALLBACK_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite'
];

function endpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function modelInfoEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}`;
}

function getApiKey(env) {
  const raw = env?.GEMINI_API_KEY;

  if (!raw) {
    return null;
  }

  const key = String(raw)
    .trim()
    .replace(/^['"]|['"]$/g, '');

  return key || null;
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = String(text || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return JSON.parse(cleaned);
  }
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunk
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + chunk
      )
    );
  }

  return btoa(binary);
}

function isRetryable(status) {
  return [
    408,
    429,
    500,
    502,
    503,
    504
  ].includes(Number(status));
}

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

async function callGemini(
  body,
  key,
  model,
  options = {}
) {
  const maxRetries =
    Number.isInteger(
      options.maxRetries
    )
      ? options.maxRetries
      : 3;

  const delays = [
    1000,
    2000,
    4000,
    8000,
    16000
  ];

  let lastError = null;

  for (
    let attempt = 0;
    attempt <= maxRetries;
    attempt++
  ) {
    try {
      const response =
        await fetch(
          endpoint(model),
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              'x-goog-api-key':
                key
            },
            body:
              JSON.stringify(
                body
              )
          }
        );

      const payload =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (response.ok) {
        return payload;
      }

      const message =
        payload?.error?.message ||
        'Gemini API request failed';

      const error =
        new Error(message);

      error.status =
        response.status;

      error.reason =
        payload?.error?.status ||
        payload?.error?.code ||
        payload?.error?.details?.[0]?.reason ||
        null;

      lastError = error;

      if (
        !isRetryable(
          response.status
        ) ||
        attempt === maxRetries
      ) {
        throw error;
      }

      await sleep(
        delays[
          Math.min(
            attempt,
            delays.length - 1
          )
        ]
      );

    } catch (error) {
      lastError = error;

      const status =
        error?.status || 0;

      if (
        !isRetryable(status) ||
        attempt === maxRetries
      ) {
        throw error;
      }

      await sleep(
        delays[
          Math.min(
            attempt,
            delays.length - 1
          )
        ]
      );
    }
  }

  throw (
    lastError ||
    new Error(
      'Gemini API request failed'
    )
  );
}

async function extractInvoice(
  bytes,
  key
) {
  const base64 =
    uint8ToBase64(bytes);

  const prompt = `
Read this hotel invoice and extract ONLY the fields below.

Do not guess.
Do not infer missing values.
If a field is not visible, return null.

Return valid JSON only.

Exact keys:
invoice_number
invoice_date
customer_name
guest_name
gstin
taxable_amount
cgst
sgst
igst
total_amount

invoice_date must be YYYY-MM-DD if visible.

The extracted data will be used for deterministic audit verification.
`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType:
                'application/pdf',
              data: base64
            }
          }
        ]
      }
    ],

    generationConfig: {
      responseMimeType:
        'application/json'
    }
  };

  let lastError = null;

  for (
    const model of INVOICE_MODELS
  ) {
    try {
      const payload =
        await callGemini(
          body,
          key,
          model,
          {
            maxRetries: 2
          }
        );

      return {
        payload,
        model
      };

    } catch (error) {
      lastError = error;

      /*
        Only move to the next model for
        temporary/rate-limit/server errors.

        Authentication and malformed-request
        errors should NOT be hidden.
      */
      if (
        !isRetryable(
          error?.status
        )
      ) {
        throw error;
      }
    }
  }

  throw (
    lastError ||
    new Error(
      'All Gemini invoice extraction models are temporarily unavailable.'
    )
  );
}

async function runAnalysis(
  body,
  key
) {
  const models = [
    ANALYSIS_MODEL,
    ...ANALYSIS_FALLBACK_MODELS
  ];

  let lastError = null;

  for (
    const model of models
  ) {
    try {
      const payload =
        await callGemini(
          body,
          key,
          model,
          {
            maxRetries: 2
          }
        );

      return {
        payload,
        model
      };

    } catch (error) {
      lastError = error;

      if (
        !isRetryable(
          error?.status
        )
      ) {
        throw error;
      }
    }
  }

  throw (
    lastError ||
    new Error(
      'All Gemini analysis models are temporarily unavailable.'
    )
  );
}

async function handleGemini(
  request,
  env
) {
  if (
    request.method !==
    'POST'
  ) {
    return jsonResponse(
      {
        error:
          'POST only'
      },
      405
    );
  }

  const key =
    getApiKey(env);

  if (!key) {
    return jsonResponse(
      {
        error:
          'GEMINI_API_KEY is missing in Cloudflare Variables and Secrets.',
        category:
          'CONFIGURATION'
      },
      500
    );
  }

  try {
    const input =
      await request.json();

    /*
      -------------------------------------
      HEALTH / CONNECTION TEST
      -------------------------------------
    */

    if (
      input.mode ===
      'health'
    ) {
      const response =
        await fetch(
          modelInfoEndpoint(
            ANALYSIS_MODEL
          ),
          {
            headers: {
              'x-goog-api-key':
                key
            }
          }
        );

      const payload =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        return jsonResponse(
          {
            ok: false,

            error:
              payload?.error?.message ||
              'Gemini authentication/model check failed',

            category:
              response.status ===
                400 ||
              response.status ===
                401
                ? 'AUTHENTICATION'
                : 'GEMINI_API',

            provider_status:
              response.status
          },
          response.status
        );
      }

      return jsonResponse(
        {
          ok: true,

          model:
            payload?.name ||
            ANALYSIS_MODEL,

          invoice_models:
            INVOICE_MODELS,

          message:
            'Gemini API key accepted and model is reachable.'
        }
      );
    }

    /*
      -------------------------------------
      INVOICE PDF EXTRACTION
      -------------------------------------
    */

    if (
      input.mode ===
      'invoice_extract'
    ) {
      if (!input.url) {
        return jsonResponse(
          {
            error:
              'Signed invoice URL is required'
          },
          400
        );
      }

      const pdf =
        await fetch(
          input.url
        );

      if (!pdf.ok) {
        throw new Error(
          'Could not fetch invoice PDF from Supabase storage'
        );
      }

      const bytes =
        new Uint8Array(
          await pdf.arrayBuffer()
        );

      const result =
        await extractInvoice(
          bytes,
          key
        );

      const payload =
        result.payload;

      const text =
        payload
          ?.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text ||
        '';

      let invoice;

      try {
        invoice =
          parseJsonText(
            text
          );
      } catch {
        throw new Error(
          'Gemini did not return valid invoice JSON'
        );
      }

      return jsonResponse(
        {
          invoice,

          model:
            payload?.modelVersion ||
            result.model
        }
      );
    }

    /*
      -------------------------------------
      O2C RISK / CONTROL ANALYSIS
      -------------------------------------
    */

    const prompt = `
You are an audit-assistance AI for an ICFR O2C transaction-testing platform.

Use ONLY the supplied company RCM, deterministic testing results, recorded exceptions and samples.

Do not invent facts.

Preserve company control codes exactly.

Do not declare a control ineffective.

Do not make the final audit conclusion.

Identify:

1. Risks implicated by observed exceptions
2. Related company controls
3. Evidence supporting each assessment
4. Controls that may require reassessment
5. Potential strengthening of existing controls
6. Potential new controls

Return JSON with exactly these keys:

executive_summary
risk_findings[]
control_improvements[]

COMPANY RCM:
${JSON.stringify(
  input.controls || []
)}

TESTS:
${JSON.stringify(
  input.tests || []
)}

EXCEPTIONS:
${JSON.stringify(
  input.exceptions || []
)}

SAMPLES:
${JSON.stringify(
  input.samples || []
)}
`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],

      generationConfig: {
        responseMimeType:
          'application/json'
      }
    };

    const result =
      await runAnalysis(
        body,
        key
      );

    const payload =
      result.payload;

    const text =
      payload
        ?.candidates?.[0]
        ?.content
        ?.parts?.[0]
        ?.text ||
      '';

    let analysis;

    try {
      analysis =
        parseJsonText(
          text
        );
    } catch {
      analysis = {
        executive_summary:
          text,

        risk_findings:
          [],

        control_improvements:
          []
      };
    }

    return jsonResponse(
      {
        analysis,

        model:
          payload?.modelVersion ||
          result.model
      }
    );

  } catch (e) {
    const status =
      e?.status || 500;

    const category =
      e?.reason ===
        'API_KEY_INVALID' ||
      status === 400 ||
      status === 401
        ? 'AUTHENTICATION'
        : status === 429
          ? 'RATE_LIMIT'
          : status === 503
            ? 'CAPACITY'
            : 'GEMINI_API';

    let friendly =
      e?.message ||
      'AI function error';

    if (
      status ===
      503
    ) {
      friendly =
        'Gemini is temporarily at capacity. The system retried the request and attempted multiple Gemini Flash models. Please retry the operation after a short wait.';
    }

    if (
      status ===
      429
    ) {
      friendly =
        'Gemini rate limit reached. The system will retry transient limits automatically; please wait briefly before trying again.';
    }

    return jsonResponse(
      {
        error:
          friendly,

        category,

        provider_status:
          status
      },
      status
    );
  }
}

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    /*
      Support both:
        /api/gemini
      and the old:
        /.netlify/functions/gemini

      This also makes an older cached frontend
      less likely to break the backend call.
    */

    if (
      url.pathname ===
        '/api/gemini' ||
      url.pathname ===
        '/.netlify/functions/gemini'
    ) {
      return handleGemini(
        request,
        env
      );
    }

    return env.ASSETS.fetch(
      request
    );
  }
};
