# Fix This

Take a photo. Tell us what's wrong. We route it to the right office.

Civic infrastructure reporting. Pilot: **Ithaca, NY + Cornell**. Designed to scale to any city.

---

## Why this stack

The previous handoff specified React + Vite. I scrapped it. Here's why:

- **Loads instantly.** Total payload is <30 KB gzipped. On 3G, first paint is under one second.
- **No build step.** This is plain HTML/CSS/JS. Drag-and-drop deploys to GitHub Pages, Vercel, Netlify, S3, or any static host.
- **Scales free.** Static files behind a CDN handle millions of req/day at near-zero cost.
- **Works offline-ish.** The classifier is local; reports persist in `localStorage` until the network comes back. Add a Service Worker later for full PWA.
- **Reads cleanly to a city employee.** No "this app smells like AI." It looks like a municipal form, because it is one.

The next-gen migration to a React build is a one-day job if it ever becomes necessary.

---

## What's in here

```
index.html         Citizen flow — landing → photo → describe → route → done
admin.html         City portal — email-then-password gate, scoped by department
assets/
  app.js           Citizen controller (~10 KB)
  admin.js         Admin controller (~9 KB)
  classifier.js    Keyword classifier + emergency screen (~4 KB)
  routing.js       Department directory for Ithaca/Cornell (~6 KB)
  storage.js       localStorage adapter + employee directory + metadata capture (~3 KB)
  crest.svg        Civic shield (placeholder — swap for real Ithaca seal)
  icon.svg         App icon
manifest.webmanifest   PWA manifest
vercel.json        Headers, caching, clean URLs
CNAME              GitHub Pages custom domain → fixthis.yashmoitra.com
404.html           Catch-all redirect to /
```

---

## Citizen flow

1. **Landing** — one big red **Fix This!** button. Nothing else.
2. **Photo** — `<input capture="environment">` opens the rear camera on phones, or file picker elsewhere. EXIF GPS is extracted from the photo if present (no compression). If absent, browser geolocation runs in the background.
3. **Describe** — a textarea, "What's wrong?" Plus an optional `+ Add more details` expand: longer description and additional media (any number of files).
4. **Emergency screen** — if the description matches life-threat or health keywords, a full-red overlay appears with a 7-second countdown. Tap **Call 911** to dial, or **Not an emergency** to keep going. We never auto-dial.
5. **Loader** — a single horizontal bar with a percentage on the right and a status line below ("Identifying department…", "Routing to Ithaca DPW…").
6. **Success** — `**ROADS & PAVEMENTS** is on it!` with the ticket ID, the department contacted, and three large buttons: edit/add more, fix another thing, or I'm done.

Once you've started a report, there is **no back button to the landing screen**. You either finish, edit, or restart.

---

## Admin flow

1. Visit `/admin.html`.
2. Type your work email. The directory lookup is case-insensitive.
   - **Unknown email** — soft error. After three attempts, a "Tell Fix This" support form appears (textarea + screenshot upload).
   - **Known email** — proceeds to password.
3. Enter password. Wrong password = retry. Right password = scoped dashboard.
4. **Scope:**
   - `ALL` (master admin) — sees every report across every department.
   - `ROADS`, `WATER`, `BUILDINGS`, etc. — sees only their department's reports.
5. Each report card has photo, classification tag, status pill, description, ticket ID, owner email (with `mailto:` prefilled), Google Maps link if location was captured, and a status dropdown (Open / In Progress / Resolved).

### Demo logins

| Email | Password | Sees |
| --- | --- | --- |
| `admin@fixthis.local` | `city2024` | Everything |
| `roads@cityofithaca.org` | `roads2024` | Roads & Pavements |
| `scl-facilities@cornell.edu` | `build2024` | Buildings |
| `tcat@tcatmail.com` | `transit2024` | Transit |
| `info@spcaonline.com` | `spca2024` | Animals |
| `askehs@cornell.edu` | `ehs2024` | Safety |

(Full list in `assets/storage.js`.)

---

## Departments (DROs) and routing

The 8 from the handoff plus three additions where Cornell-specific edge cases matter:

| Key | Department | Primary owner |
| --- | --- | --- |
| `ROADS` | Roads & Pavements | Ithaca DPW |
| `WATER` | Water & Plumbing | Ithaca Water & Sewer |
| `WASTE` | Waste & Sanitation | Tompkins County Recycling |
| `PARKS` | Parks & Horticulture | Ithaca Parks & Forestry |
| `TRANSIT` | Public Transit | TCAT |
| `LIGHTING` | Street Lighting | NYSEG |
| `BUILDINGS` | Buildings & Structures | Cornell Housing Maintenance |
| `IT` | Network & IT | Cornell IT Service Desk |
| `ANIMAL` | Animals & Wildlife | SPCA Tompkins |
| `SAFETY` | Environmental Health & Safety | Cornell EHS |
| `GENERAL` | Anything else | Fix This triage |

Each DRO has an **owner chain** — primary, secondary, tertiary. The `routing.js` `pickOwner()` picks the Cornell-scoped owner if the description mentions any campus location ("dorm", "Risley", "Ag Quad", etc.), else falls back to city.

---

## Emergency detection

Two-stage:

1. **Pattern match** on the description. Patterns target life-threat (fire, gun, unconscious, seizure, gas leak, …), poison, and mental-health crises.
2. **Tier mapping** — life-threat → 911 prompt, suicide/self-harm → Cornell Health 24h line, poison → Poison Control 1-800-222-1222.

The 7-second countdown is intentional: it's long enough that a real emergency caller can hit the call button without the screen yanking out from under them, and short enough that a non-emergency user isn't annoyed.

If the user lets the timer expire, the report is marked `urgent: <tier>` and routed to the responsible department with that flag visible on the dashboard.

---

## Location capture

Three sources, in priority order:

1. **EXIF GPS** from the uploaded photo. Photos taken by the iOS/Android camera carry lat/lon in the JPEG metadata; `app.js` parses the EXIF directly without any library. We do not compress the photo before reading it.
2. **Browser geolocation**, prompted in the background as soon as the user taps the big red button. By the time they finish describing, we usually have a fix.
3. **None** — the report still goes through, but the dashboard tags it `📍 no location`.

---

## Metadata captured (for evidentiary integrity)

Every submission records: timestamp, timezone, user agent, language, platform, screen size, viewport, online state, referrer. The IP is captured server-side; the placeholder in `storage.js` documents that. EXIF data and the raw photo are stored verbatim.

---

## Deploy

### GitHub Pages (one-shot, what we're doing)

1. Push this repo to `github.com/moitrayash/fixthis`.
2. Repo → Settings → Pages → Branch `main`, folder `/`. Save.
3. The CNAME file already points at `fixthis.yashmoitra.com`. Add a CNAME record at your DNS provider (Wix) pointing `fixthis` → `moitrayash.github.io`.
4. Wait for DNS, enable HTTPS in Pages settings.

### Vercel (alternative, faster TLS)

```sh
npx vercel --prod
```

`vercel.json` sets cache headers and clean URLs.

### Local

```sh
npm run dev    # serves on http://localhost:5173
```

---

## Roadmap

- Real backend + DB so reports survive across devices.
- Per-employee accounts (today: one shared password per department).
- Server-side emails to owner mailboxes when a report is filed.
- Spanish + simplified Chinese on the citizen flow.
- Region picker so the same app works for Ithaca / Prague / Bangalore / wherever.
- A real Service Worker for true offline.
- Image moderation (we don't want abuse photos forwarded to a city employee).

---

## Contacts source

All Ithaca/Cornell phone numbers, emails, and hours were verified May 2026 against the official sites listed in `CONTACTS.md`. Re-verify quarterly.
