# ICFR O2C — final Cloudflare Workers deployment

This package uses the current Cloudflare Workers Static Assets architecture. The Worker code is `worker.js`; the website is under `root`; `wrangler.jsonc` binds them as one deployment.

## Existing Worker (recommended)

You already created the Worker and added `GEMINI_API_KEY`. Keep that Worker.

1. Confirm the Worker name in Cloudflare. This package is set to `icfr-o2c-audit` in `wrangler.jsonc`. If the dashboard shows a different name, change only `name` in `wrangler.jsonc` to that exact name.
2. Create a GitHub repository and upload the CONTENTS of this package so `wrangler.jsonc`, `root`, and `root` are at repository root.
3. Cloudflare → Workers & Pages → select the existing Worker → Settings → Builds → Connect.
4. Connect GitHub and select the new repository.
5. Branch: `main`.
6. Build command: leave blank.
7. Deploy command: `npx wrangler deploy`.
8. Save/Connect, then push the repository. Workers Builds will build and deploy the Worker.

Cloudflare requires the Worker name in the Wrangler configuration to match the dashboard Worker name when a repository is connected.

## Gemini secret

Keep the already-created secret:

`GEMINI_API_KEY`

The value must be the NEW Gemini AI Studio AUTH API key created today under `Default Gemini Project`. Do not put that value in any source file or GitHub repository.

If the secret is missing, add it in:
Workers & Pages → Worker → Settings → Variables and Secrets → Add → Secret

Name: `GEMINI_API_KEY`

Then select Deploy.

## Verification

After the Worker deployment completes, open the Worker URL and go to:
AI Risk & Control Intelligence → Test Gemini Connection

Expected result:
`Gemini connected.`

## Architecture

Browser → `/api/gemini` → Cloudflare Worker → Gemini API
Browser → Supabase REST/Storage

Gemini only extracts invoice fields and interprets the company RCM against deterministic testing results. Final reconciliation results and auditor conclusions remain separate from AI output.
