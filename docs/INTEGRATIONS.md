# Fix This — Integrations Guide

Quick recipes for connecting Fix This to common dashboarding and BI tools. Every recipe uses one of the export formats described in [`API.md`](API.md). The CSV format is the lowest common denominator and works everywhere; JSON is the richest; GeoJSON is for spatial work.

## Excel / Google Sheets

1. Sign in to `export.html`.
2. Apply filters as needed.
3. Click **Download CSV**.
4. Open the file in Excel or import to Google Sheets via *File &rarr; Import*.

For a recurring refresh in Google Sheets, use the `IMPORTDATA()` formula against a published JSON URL once we add a public read endpoint, or schedule a re-download.

## Microsoft Power BI

1. Power BI Desktop &rarr; *Get Data &rarr; Web*.
2. Paste the CSV download URL (or local path).
3. Power Query will auto-detect columns &mdash; confirm types:
   - `created_at`, `updated_at`, `resolved_at`, `photo_taken_at` &rarr; **DateTime**
   - `lat`, `lng`, `accuracy` &rarr; **Decimal**
   - everything else &rarr; **Text**.
4. Build visuals on top of `status`, `dro`, and `severity`.

For a live connection, use the Firestore REST API directly via *Get Data &rarr; Web &rarr; Advanced* and add a custom transform that flattens the response.

## Tableau

1. *Connect &rarr; Text File* &rarr; pick the CSV.
2. Drag `Created At` to columns, `Number of Records` to rows.
3. Add `DRO` to color, `Status` to filter.

For map views, instead of CSV use the GeoJSON download with the *Spatial File* connector. The `geometry` field will become a Tableau geometry column automatically.

## Looker Studio (Google)

1. *Add data &rarr; File upload*.
2. Select the CSV.
3. Looker Studio will infer types &mdash; confirm `created_at` is a **Date &amp; Time** dimension.
4. Build the report.

## Mapbox / MapLibre

```js
map.addSource("fixthis", {
  type: "geojson",
  data: "https://your-host.example.com/fixthis.geojson"
});
map.addLayer({
  id: "fixthis-points",
  type: "circle",
  source: "fixthis",
  paint: {
    "circle-radius": 6,
    "circle-color": [
      "match", ["get", "status"],
      "open", "#dc2626",
      "in_progress", "#f59e0b",
      "resolved", "#16a34a",
      "#6b7280"
    ],
    "circle-stroke-width": 1,
    "circle-stroke-color": "#fff"
  }
});
```

Properties available on each feature: `id`, `status`, `severity`, `dro`, `description`, `created_at`, `updated_at`, `photo_taken_at`, `owner_scope`. See [`SCHEMA.md`](SCHEMA.md) and `SCHEMA.toGeoJsonFeature()`.

## Leaflet (already used by Fix This itself)

```js
const layer = L.geoJSON(geojson, {
  pointToLayer: (f, latlng) => L.circleMarker(latlng, {
    radius: 6,
    color: { open: "#dc2626", in_progress: "#f59e0b", resolved: "#16a34a", closed: "#6b7280" }[f.properties.status] || "#6b7280",
    fillOpacity: 0.85
  }).bindPopup(f.properties.description)
}).addTo(map);
```

## ArcGIS / QGIS

Both accept GeoJSON natively. Drag the file into the layers panel; both products will project from WGS84 automatically.

## Kepler.gl

*Add Data &rarr; GeoJSON*. Drop the file. Kepler will auto-detect timestamps for time animation &mdash; map `created_at` to the time axis to play back ticket arrivals.

## Grafana

Two paths:

1. **Static dashboard** &mdash; sync the CSV into a Postgres / SQLite source on a cadence; query in Grafana like any time series. Use `created_at` as the time field.
2. **JSON datasource** &mdash; install the Grafana JSON datasource plugin and point at the JSON download URL. Map `total`, `by_status.open`, etc. from the stats endpoint to single-stat panels.

## Metabase

Easiest path: ingest the CSV into Postgres / MySQL / BigQuery with a small loader script (one CSV column = one SQL column thanks to the flat row shape), then connect Metabase. Schedule the loader hourly.

## Open311 dashboards (SeeClickFix, CitySDK, etc.)

Point the consumer at:

- `requests.json` &mdash; the GeoReport v2 service requests collection.
- `services.json` &mdash; the catalog of DROs as services.

Both downloads are produced by `export.html`. To host them at stable URLs, copy them into the repo and commit; GitHub Pages will serve them at `https://fixthis.yashmoitra.com/api/requests.json` and `/api/services.json` if dropped in an `api/` folder.

## SQL ingest schema

If you're loading the CSV into a relational store, this is the recommended `CREATE TABLE`:

```sql
CREATE TABLE fixthis_reports (
  id                  TEXT PRIMARY KEY,
  status              TEXT NOT NULL,
  severity            TEXT NOT NULL,
  dro                 TEXT NOT NULL,
  title               TEXT,
  description         TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  address             TEXT,
  accuracy            DOUBLE PRECISION,
  owner_scope         TEXT,
  owner_email         TEXT,
  owner_phone         TEXT,
  reporter_anonymous  BOOLEAN,
  source              TEXT,
  photo_taken_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ
);
CREATE INDEX fixthis_reports_status_dro ON fixthis_reports (status, dro);
CREATE INDEX fixthis_reports_created_at ON fixthis_reports (created_at);
```

Column order matches the CSV exactly so a naive `COPY` works.

## Custom integrations

If you want to write your own client, the canonical reference implementation lives in `assets/storage.js`. It demonstrates:

- Lazy-loading the Firestore SDK from CDN (no build step required).
- A `subscribe()` callback for real-time updates.
- Schema normalization on read.
- Schema validation on write.

Any HTTP-aware language can replicate the pattern via the Firestore REST API.
