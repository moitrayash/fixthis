# Fix This — Data Schema

**Version**: 1
**Source of truth**: [`assets/schema.js`](../assets/schema.js)
**Wire format on disk**: [Cloud Firestore](https://firebase.google.com/docs/firestore) collection `reports` in project `fixthis-17c64`.

This document describes every field on a `Report`, the canonical record produced by the citizen flow and consumed by every dashboard, export, and integration.

## Conventions

- All field names are **`snake_case`**.
- All timestamps are **ISO 8601 UTC strings** (`2026-05-07T18:42:00.000Z`). Legacy records stored numeric `Date.now()` values; the storage layer normalizes these on read.
- Coordinates use **WGS84** decimal degrees. Lat/lng order in JSON is `{ lat, lng }`; in GeoJSON the order flips to `[lng, lat]` per RFC 7946.
- IDs follow the pattern `FIX-YYMMDD-XXXX` where `XXXX` is a 4-character base36 random suffix.

## Backward compatibility

Reports written by v1 of Fix This used camelCase aliases (`createdAt`, `takenAt`, `photoMeta`). The `STORAGE` adapter:

1. **Reads** legacy field names and produces canonical snake_case via `SCHEMA.normalize()`.
2. **Decorates** outputs with both naming styles so v1 consumers (`app.js`, `admin.js`) keep working.
3. **Writes** canonical snake_case to Firestore.

New code should read snake_case only.

## Report

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | string | yes | — | Pattern `FIX-YYMMDD-XXXX`. Generated client-side. |
| `schema_version` | number | yes | `1` | Bump when this document changes. |
| `status` | enum | yes | `open` | `open` \| `in_progress` \| `resolved` \| `closed` |
| `severity` | enum | yes | `medium` | `low` \| `medium` \| `high` \| `emergency` |
| `dro` | string | yes | `GENERAL` | Department of Responsibility key. See `assets/routing.js`. |
| `title` | string | no | `""` | Short label, optional. |
| `description` | string | yes | `""` | Citizen-supplied free text. |
| `location` | object | no | `null` | `{ lat, lng, accuracy?, address? }`. |
| `photo` | string | no | `null` | Data URL (compressed JPEG) or `https://` URL. |
| `photo_meta` | object | no | `null` | `{ width, height, originalSize, compressedSize, takenAt? }` |
| `photo_taken_at` | string | no | `null` | ISO 8601, parsed from EXIF when available. |
| `owner` | object | no | `null` | `{ scope, email?, phone? }`. Resolved by `ROUTING.pickOwner()`. |
| `reporter` | object | no | `null` | `{ anonymous, name?, contact? }`. |
| `source` | enum | yes | `citizen_web` | `citizen_web` \| `admin` \| `api` \| `import` |
| `tags` | string[] | no | `[]` | Free-form labels. |
| `classification` | object | no | `null` | Output of `assets/classifier.js`. |
| `created_at` | string | yes | _now_ | ISO 8601. |
| `updated_at` | string | yes | _now_ | ISO 8601. Bumped on every patch. |
| `resolved_at` | string | no | `null` | Set when status transitions to `resolved`. |
| `history` | object[] | no | `[]` | `[{ at, by, action, from, to }]` audit trail. |
| `metadata` | object | no | `null` | Capture blob (UA, viewport, tz). |

## Status enum

| Value | Meaning |
|---|---|
| `open` | New, awaiting triage. |
| `in_progress` | Owner accepted, work under way. |
| `resolved` | Fixed in the field. |
| `closed` | Terminal — duplicate, invalid, or out-of-scope. |

Allowed transitions are encoded in `SCHEMA.TRANSITIONS` and enforced via `SCHEMA.canTransition(from, to)`.

## Severity enum

| Value | Routing implication |
|---|---|
| `low` | Standard queue. |
| `medium` | Standard queue (default). |
| `high` | Surfaced first in admin kanban. |
| `emergency` | Triggers the 7-second 911 prompt in citizen flow; visible as red badge in admin. |

## Source enum

| Value | Producer |
|---|---|
| `citizen_web` | Citizen flow (`index.html` + `app.js`). |
| `admin` | Admin-created tickets (`admin.html`). |
| `api` | External integrations writing via REST. |
| `import` | Bulk migrations. |

## DRO keys

Fix This currently routes to 11 DROs. Full table in `assets/routing.js` and dynamically queryable via `ROUTING.list()`.

```
ROADS · WATER · WASTE · PARKS · TRANSIT · LIGHTING ·
BUILDINGS · IT · ANIMAL · SAFETY · GENERAL
```

## Validation

```js
const result = SCHEMA.validate(report);
// { valid: true } | { valid: false, errors: ["dro must be uppercase identifier", ...] }
```

`STORAGE.save()` calls `validate()` and throws if invalid. Always normalize first:

```js
STORAGE.save(SCHEMA.normalize(input));
```

## Flat row (for SQL / CSV)

`SCHEMA.toFlatRow(report)` produces a JSON-flat object suitable for a single CSV row or a relational insert. See [`docs/INTEGRATIONS.md`](INTEGRATIONS.md) for the column list.
