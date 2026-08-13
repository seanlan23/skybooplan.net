/** Branded HTML for the Google OAuth auto-POST starter (no client fetch). */

const LOGO_MARK_SVG = `
<svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#0EA5E9" d="M8 36 L40 8 L40 24 Z" />
  <path fill="#7DD3FC" d="M8 36 L40 24 L22 36 Z" />
  <path fill="#0284C7" d="M22 36 L40 24 L40 38 Z" />
</svg>
`.trim();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildGoogleOAuthStartHtml(opts: {
  csrfToken: string;
  callbackUrl: string;
  signInAction?: string;
}): string {
  const action = opts.signInAction ?? "/api/auth/signin/google";
  const csrf = escapeHtml(opts.csrfToken);
  const callback = escapeHtml(opts.callbackUrl);
  const actionEsc = escapeHtml(action);

  return `<!DOCTYPE html>
<html lang="sl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google prijava — skybooplan</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      :root {
        --sky: #0EA5E9;
        --sky-dark: #0284C7;
        --sky-light: #7DD3FC;
        --ink: #0f172a;
        --muted: #64748b;
        --card: #ffffff;
        --warm: #f4a261;
        --warm-deep: #e76f51;
        --hero: linear-gradient(165deg, #f7fbff 0%, #e8f4fc 42%, #fdf6ef 100%);
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        color: var(--ink);
        background: var(--hero);
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        min-height: 100vh;
      }
      .card {
        width: min(100%, 380px);
        background: var(--card);
        border: 1px solid rgba(14, 165, 233, 0.14);
        border-radius: 28px;
        padding: 36px 32px 32px;
        text-align: center;
        box-shadow:
          0 1px 0 rgba(255,255,255,0.8) inset,
          0 18px 40px rgba(2, 132, 199, 0.1);
        animation: rise 0.45s ease-out;
      }
      @keyframes rise {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: inherit;
        margin-bottom: 22px;
      }
      .wordmark {
        font-size: 28px;
        letter-spacing: -0.5px;
        line-height: 1;
      }
      .wordmark .sky,
      .wordmark .plan { font-weight: 700; }
      .wordmark .boo {
        font-weight: 300;
        color: var(--sky);
      }
      h1 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 650;
        letter-spacing: -0.02em;
      }
      p {
        margin: 8px 0 0;
        font-size: 0.92rem;
        color: var(--muted);
        line-height: 1.45;
      }
      .orbit {
        width: 64px;
        height: 64px;
        margin: 28px auto 8px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, rgba(14,165,233,0.12), rgba(244,162,97,0.16));
        position: relative;
      }
      .orbit::after {
        content: "";
        position: absolute;
        inset: -4px;
        border-radius: inherit;
        border: 2px solid transparent;
        border-top-color: var(--sky);
        border-right-color: var(--warm);
        animation: spin 0.9s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .footer {
        margin-top: 22px;
        font-size: 0.75rem;
        color: var(--muted);
      }
      .footer span {
        color: var(--sky-dark);
        font-weight: 600;
      }
      noscript p { color: var(--warm-deep); margin-top: 16px; }
    </style>
  </head>
  <body>
    <main class="card">
      <a class="brand" href="/" aria-label="skybooplan">
        ${LOGO_MARK_SVG}
        <div class="wordmark" aria-hidden="true">
          <span class="sky">sky</span><span class="boo">boo</span><span class="plan">plan</span>
        </div>
      </a>
      <h1>Povezujem z Googlom</h1>
      <p>Trenutek — odpiram varno Google prijavo za tvoj skybooplan račun.</p>
      <div class="orbit" aria-hidden="true">${LOGO_MARK_SVG.replace('width="44"', 'width="28"').replace('height="44"', 'height="28"')}</div>
      <p class="footer">Travel planner · <span>skybooplan</span></p>
      <form id="google-oauth" method="POST" action="${actionEsc}">
        <input type="hidden" name="csrfToken" value="${csrf}" />
        <input type="hidden" name="callbackUrl" value="${callback}" />
      </form>
      <noscript>
        <p>Omogoči JavaScript ali klikni gumb spodaj.</p>
        <button type="submit" form="google-oauth">Nadaljuj na Google</button>
      </noscript>
    </main>
    <script>document.getElementById("google-oauth").submit();</script>
  </body>
</html>`;
}
