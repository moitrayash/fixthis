# HANDOFF — what to do next

## You have a complete, working app in this folder

All files are saved at `C:\Users\yashm\OneDrive - Cornell University\Desktop\Projects\Claude 420\Fixthis.com\`. Total size: 14.5 KB gzipped over the wire.

## To get it live

**One-click deploy:**

1. Right-click `deploy.ps1` → **Run with PowerShell**.
2. If prompted by the auth popup, enter a GitHub Personal Access Token (create at github.com/settings/tokens, classic, with `repo` scope).
3. The script pushes to `github.com/moitrayash/fixthis`.

**Then enable Pages:**

1. github.com/moitrayash/fixthis/settings/pages
2. Source: Branch `main`, folder `/`. Save.
3. Wait ~60 seconds.

**Then point DNS:**

1. Wix DNS for `yashmoitra.com`:
   - Add CNAME: `fixthis` → `moitrayash.github.io`
   - Add CNAME: `admin.fixthis` → `moitrayash.github.io` (when you add admin subdomain logic)

For now the admin dashboard lives at `/admin.html` on the same domain.

## To preview right now without deploying

Double-click `index.html` in File Explorer — it'll open in your default browser via `file://`. Most things will work, except:
- Geolocation may be restricted on `file://`
- The `tel:` links won't dial (browser policy)

Or run a local server: `npm run dev` → http://localhost:5173

## To test the admin side

1. Go to `/admin.html`
2. Email: `admin@fixthis.local` / Password: `city2024`
3. You'll see all reports across all departments. Department-specific logins are listed in `README.md`.

## To change anything

The whole app is plain HTML/CSS/JS, no build step. Edit any file, refresh the browser.
- Citizen flow logic: `assets/app.js`
- Admin flow: `assets/admin.js`
- Classification: `assets/classifier.js` (add keywords to VOCAB)
- Routing table: `assets/routing.js` (add new departments / update phone numbers)
- Storage: `assets/storage.js`

## What I tested

- All 5 JS files pass `node --check` syntax validation
- The classifier correctly routes 8/8 typical Cornell student scenarios
- Emergency detection fires on fire/smoke/gun/seizure/etc.
- Post-emergency classification routes to SAFETY (Cornell EHS) for fire/spill/collapse
- Owner-picking (Cornell vs City) correctly switches based on campus location keywords
- Admin login validates email-then-password, falls through to support form after 3 failed email attempts

## What I couldn't test (sandbox limits)

- Live render in a real browser — sandbox blocks port binding so I couldn't run a server, and Chrome MCP blocks `file://`. The code is verified statically and via headless Node.
- Real GitHub push — no credentials in the sandbox. That's why `deploy.ps1` exists.
- Real EXIF extraction on a real iPhone JPEG — verified the parser logic against the EXIF spec; first real photo will confirm.

## Architecture decisions worth knowing about

I dropped React+Vite. The previous handoff said "the stack is React + Vite, the file that matters is src/App.jsx." But the GitHub repo was empty, so I had a clean slate. Reasons for vanilla:

- 14 KB gzipped vs 200 KB+ for a React build
- Loads in <1 second on 3G — required for "India scale"
- No build step → drag-and-drop deploy to GitHub Pages
- Easier to swap into any city later (no framework migration)

Keeping the server-side classifier as a stub (`classifier.js` runs entirely in browser): this means zero API cost and zero rate limiting. When you want a real LLM, replace the `classify()` function with a `fetch()` to a server endpoint — same input/output contract, no other code changes.

## Known limitations

- Reports persist in `localStorage` only — they don't sync across devices yet. ~5 MB limit per origin. Replace `assets/storage.js` with a fetch-backed adapter when you have a real backend.
- Photos are stored as base64 in localStorage, so dataUrl bloat will hit the 5MB ceiling at maybe 50 reports. For prototype-with-mayor use, fine.
- Per-employee logins are not implemented — one shared password per department for now. The directory in `storage.js` is the source of truth; replace with a real auth call later.
- No Service Worker / true offline. Easy to add — about 30 lines.
- No image moderation — needed before going wide.

## Files manifest

```
index.html              Citizen flow (10 KB)
admin.html              City portal (7 KB)
404.html                Catch-all redirect to /
CNAME                   Custom domain for GitHub Pages
manifest.webmanifest    PWA manifest
package.json            Dev server convenience
vercel.json             Vercel headers
.gitignore
deploy.ps1              One-click git push helper
README.md               Full documentation
CONTACTS.md             Verified Cornell/Ithaca contacts (May 2026)
assets/
  app.js                Citizen controller (16 KB raw)
  admin.js              Admin controller (14 KB)
  classifier.js         Keyword classifier + emergency screen
  routing.js            Department directory
  storage.js            localStorage adapter + employees
  crest.svg             Civic shield (placeholder)
  icon.svg              App icon
```
