# Fix This — API Reference

**Version**: 1
**Base URL**: `https://firestore.googleapis.com/v1/projects/fixthis-17c64/databases/(default)/documents`
**Local exports**: `https://fixthis.yashmoitra.com/export.html` (admin-gated)
**Schema**: [`SCHEMA.md`](SCHEMA.md) · [`openapi.yaml`](openapi.yaml)

Fix This is a static site backed by **Cloud Firestore**, a managed NoSQL document store with a fully documented REST API. Any HTTP-aware tool can read the live data without going through our frontend.

This document describes both:

1. The **direct Firestore REST API** (read-only, public-by-design for the demo).
2. The **export endpoints** rendered by `export.html` (admin-gated downloads in CSV / JSON / GeoJSON / Open311 formats).

## Authentication

| Surface | Auth |
|---|---|
| Firestore reads | Public read, allowed by security rules for the demo. **Do not** put secrets into `reports`. |
| Firestore writes | Public create allowed for citizen submissions; updates restricted by rules. |
| `export.html` downloads | Demo employee email + password (see `assets/storage.js` `DEFAULT_EMPLOYEES`). |
| Admin kanban | Same email + password gate. |

For a production cutover, swap the Firestore security rules to require Firebase Authentication (or App Check), and put `export.html` behind a real IdP.

## Endpoints

### `GET /reports` — list reports

Direct Firestore REST:

```
GET https://firestore.googleapis.com/v1/projects/fixthis-17c64/databases/(default)/documents/reports?pageSize=100
```

Response is Firestore's [`structured`](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list) shape. To get our flat schema, use the export page or run the canonical client below.

### `GET /reports/{id}` — single report

```
GET https://firestore.googleapis.com/v1/projects/fixthis-17c64/databases/(default)/documents/reports/FIX-260507-A1B2
```

### `POST /reports` — citizen submission (via SDK)

The browser SDK is the production path. From a third-party app:

```js
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
const app = initializeApp({
  projectId: "fixthis-17c64",
  apiKey: "AIzaSyDeaFx4p2XtM191GOj-Ehlr2hCz2A9Ua_o"
});
const db = getFirestore(app);
await setDoc(doc(db, "reports", report.id), report);
```

Body must be a valid `Report` (see [`SCHEMA.md`](SCHEMA.md)). Run it through `SCHEMA.normalize()` and `SCHEMA.validate()` first.

## Export endpoints (browser-rendered)

These are static URLs that produce a fresh download on click. Built by `assets/export.js` from the live Firestore cache.

| Path | Format | MIME | Use case |
|---|---|---|---|
| `export.html` &rarr; CSV button | CSV (RFC 4180) | `text/csv` | Excel, Power BI, Tableau, Looker Studio |
| `export.html` &rarr; JSON button | Canonical JSON | `application/json` | ETL, archives, custom dashboards |
| `export.html` &rarr; GeoJSON button | GeoJSON FeatureCollection | `application/geo+json` | Mapbox, Leaflet, ArcGIS, QGIS |
| `export.html` &rarr; `requests.json` | Open311 GeoReport v2 | `application/json` | Civic-tech dashboards |
| `export.html` &rarr; `services.json` | Open311 services list | `application/json` | Open311 service catalog |
| `export.html` &rarr; Stats button | Aggregated counts | `application/json` | Lightweight KPI dashboards |

Filters supported on every export:

- `status` (`open` / `in_progress` / `resolved` / `closed`)
- `dro` (any key from `assets/routing.js`)
- `severity` (`low` / `medium` / `high` / `emergency`)
- `since` / `until` (ISO 8601 dates)
- `q` (full-text on description)

Scope-restricted accounts auto-apply their `dro` filter so a department can only export its own data.

## Open311 compatibility

The Open311 GeoReport v2 export covers the read paths that civic-tech tools expect:

```
GET .../requests.json   # service_request collection
GET .../services.json   # available service types (the DROs)
```

Field mapping (`SCHEMA.toOpen311()`):

| Open311 | Fix This |
|---|---|
| `service_request_id` | `id` |
| `status` | `open` (open + in_progress) / `closed` (resolved + closed) |
| `service_name`, `service_code` | `dro` |
| `description` | `description` |
| `requested_datetime` | `created_at` |
| `updated_datetime` | `updated_at` |
| `address` | `location.address` |
| `lat`, `long` | `location.lat`, `location.lng` |
| `media_url` | `photo` (if `https://`; data URLs omitted) |

Notes:

- `status_notes` is filled in only when status is `in_progress`.
- We don't currently expose `agency_responsible`; ownership is in the canonical export.
- Inbound POST `requests.json` is not yet supported &mdash; the read paths cover the dashboard use case.

## Webhooks (planned)

Not yet implemented. The chosen pattern when we ship them:

```
POST <your_url>
Headers:
  X-FixThis-Event: report.created | report.updated | report.resolved
  X-FixThis-Signature: sha256=<hmac>
Body:
  { event, report: <Report>, sent_at }
```

## Errors

| HTTP | Meaning |
|---|---|
| `400` | Malformed request &mdash; missing required field, invalid enum, lat/lng out of range. |
| `401` | Unauthenticated (export gates only). |
| `403` | Forbidden by Firestore security rules. |
| `404` | Document not found. |
| `429` | Firestore quota exceeded. |
| `5xx` | Backend error &mdash; retry with exponential backoff. |

## Versioning

The schema is versioned via the top-level `schema_version` field on every report (currently `1`). Breaking field changes will bump this number; clients should ignore unknown fields and tolerate missing optional ones.
