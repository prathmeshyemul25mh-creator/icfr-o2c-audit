# ICFR O2C Audit Testing & Risk-Control Intelligence — Cloudflare Workers

O2C-only audit assistance prototype.

Inputs:
- Sales Register
- Payment Register
- Bank Statement
- Auditor-selected Existing Audit Samples
- Company-specific RCM
- Invoice PDF evidence

Core behavior:
- The auditor supplies samples; the system does not sample.
- Invoice PDF fields are extracted by Gemini.
- Deterministic code performs the actual evidence reconciliation.
- Each sample becomes MATCHED or EXCEPTION.
- Exceptions are stored for investigation.
- Auditor conclusion is captured separately.
- Gemini interprets the company RCM and deterministic exceptions; it does not make the final audit conclusion.
