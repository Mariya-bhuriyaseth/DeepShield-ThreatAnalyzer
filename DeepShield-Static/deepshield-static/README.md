# DeepShield — Threat Analyzer (Static Edition)

A fully static, no-backend version of DeepShield. Every scan — link, message,
or QR code — is analyzed entirely in the visitor's own browser with
JavaScript, and scan history is saved in the browser's `localStorage`. There
is no server, no database, and no API calls anywhere in this version, which
means it deploys to any static host with zero configuration.

## Folder structure

```
deepshield-static/
├── index.html          # Home page
├── analyzer.html        # Scan engine page
├── dashboard.html        # History dashboard
├── about.html             # About / how it works
├── 404.html                 # Custom not-found page
├── netlify.toml               # Netlify config (optional, zero-config already works)
├── css/
│   └── style.css              # Full design system
└── js/
    ├── common.js                # Shared UI helpers (toasts, risk badges, the scan-ring gauge)
    ├── storage.js                 # localStorage-based history (replaces a database)
    ├── analyzer-engine.js           # The actual scam/phishing/QR risk-scoring rules
    ├── analyzer-page.js               # Wires up the Analyzer page (tabs, QR upload, submit)
    ├── dashboard-page.js                # Wires up the Dashboard page (table, chart, search, delete)
    └── home-page.js                       # Fills in live stats on the home page
```

## How it works

- **Links & messages**: `analyzer-engine.js` runs the same rule-based checks
  as the original backend version — IP addresses instead of domains, brand
  impersonation, urgency language, OTP requests, and more — entirely in
  JavaScript.
- **QR codes**: decoded directly in the browser using the
  [jsQR](https://github.com/cozmo/jsQR) library (loaded from a CDN), then run
  through the same link-analysis engine.
- **History**: every completed scan is saved to `localStorage` under the key
  `deepshield_history`. This is per-browser, per-device — it won't sync
  across devices, and clearing browser data clears it.

## Deploy to Netlify

1. Push this folder to a GitHub repo (or drag the folder straight into
   Netlify's dashboard for an instant deploy with no Git at all).
2. Go to **app.netlify.com** → **Add new site** → **Import an existing project**.
3. Connect your GitHub repo.
4. Build settings:
   - **Build command:** leave blank
   - **Publish directory:** `.` (or the folder this README is in)
5. Click **Deploy site**. Done — no backend, no build step, nothing to configure.

## Deploy to Cloudflare Pages

1. Go to the **Cloudflare dashboard** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick your repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** leave blank
   - **Build output directory:** `/` (repo root, or wherever these files live)
4. Click **Save and Deploy**.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo → **Settings** → **Pages**.
3. Under **Source**, choose **Deploy from a branch** → pick `main` and `/ (root)`.
4. Save. Your site will be live at `https://yourusername.github.io/your-repo-name/`.

## Local preview before deploying

No install needed — any simple static server works, for example:
```bash
python3 -m http.server 8000
```
then open `http://localhost:8000`.

## Honest limitations of this version

- **History is local to one browser.** It won't show up on another device,
  and incognito/private windows won't save anything after the session ends.
- **No multi-user / shared dashboard.** Every visitor sees only their own
  device's history, not anyone else's.
- If you need server-saved history that's the same for everyone, that's what
  the original Flask + SQLite version of DeepShield does instead — this
  static version trades that for "deploys anywhere, instantly, for free."
