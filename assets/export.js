/* Fix This — exporters (v1).
   ----------------------------------------------------------------
   Pure functions that turn a Reports[] array into industry-standard
   formats. These are the bridge between Fix This's Firestore backend
   and downstream tools:

     CSV       → Excel, Power BI, Tableau, Looker Studio
     JSON      → any HTTP-aware ETL or dashboard
     GeoJSON   → Mapbox, Leaflet, ArcGIS, QGIS, Kepler.gl
     Open311   → civic-tech ecosystem (SeeClickFix, CitySDK, etc.)

   Inputs are canonical Reports as produced by SCHEMA.normalize().
   No DOM, no network — these are testable pure functions.
*/
(function () {
  "use strict";
  if (!window.SCHEMA) {
    console.error("export.js: SCHEMA missing — load assets/schema.js first");
    return;
  }
  const S = window.SCHEMA;

  // ---------- CSV ----------
  // RFC 4180 quoting (double-quote wrap, escape internal quotes by doubling).
  function csvCell(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCsv(reports) {
    const rows = reports.map(S.toFlatRow);
    if (rows.length === 0) {
      // Still emit headers from the schema's flat shape so downstream
      // tools can detect columns.
      const sample = S.toFlatRow(S.normalize({ id: "FIX-000000-XXXX" }));
      return Object.keys(sample).join(",") + "\n";
    }
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(",")];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      lines.push(headers.map(function (h) { return csvCell(r[h]); }).join(","));
    }
    return lines.join("\n") + "\n";
  }

  // ---------- JSON (canonical) ----------
  function toJson(reports, opts) {
    const pretty = !!(opts && opts.pretty);
    const payload = {
      schema_version: S.VERSION,
      generated_at: new Date().toISOString(),
      count: reports.length,
      reports: reports.map(S.normalize)
    };
    return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  }

  // ---------- GeoJSON FeatureCollection ----------
  function toGeoJson(reports) {
    const features = [];
    for (let i = 0; i < reports.length; i++) {
      const f = S.toGeoJsonFeature(reports[i]);
      if (f) features.push(f);
    }
    return JSON.stringify({
      type: "FeatureCollection",
      generated_at: new Date().toISOString(),
      features: features
    });
  }

  // ---------- Open311 GeoReport v2 ----------
  // https://wiki.open311.org/GeoReport_v2/
  // Returns the requests.json shape; services.json is built from routing.js
  function toOpen311(reports) {
    return JSON.stringify({
      service_requests: reports.map(S.toOpen311)
    });
  }

  // Build services.json from window.ROUTING (DRO list).
  function toOpen311Services() {
    const out = [];
    if (window.ROUTING && typeof window.ROUTING.list === "function") {
      const dros = window.ROUTING.list();
      for (let i = 0; i < dros.length; i++) {
        const d = dros[i];
        out.push({
          service_code: d.key,
          service_name: d.label,
          description: d.examples || "",
          metadata: false,
          type: "realtime",
          keywords: (d.examples || "").split(/,\s*/).join(","),
          group: "fixthis"
        });
      }
    }
    return JSON.stringify({ services: out });
  }

  // ---------- Stats summary (for dashboards that want pre-aggregated data) ----------
  function toStats(reports) {
    function bump(map, k) { map[k] = (map[k] || 0) + 1; }
    const byStatus = {}, byDro = {}, bySeverity = {}, byDay = {};
    let resolvedTotalMs = 0, resolvedCount = 0;
    for (let i = 0; i < reports.length; i++) {
      const r = reports[i];
      bump(byStatus, r.status || "open");
      bump(byDro, r.dro || "GENERAL");
      bump(bySeverity, r.severity || "medium");
      const day = (r.created_at || "").slice(0, 10);
      if (day) bump(byDay, day);
      if (r.resolved_at && r.created_at) {
        resolvedTotalMs += +new Date(r.resolved_at) - +new Date(r.created_at);
        resolvedCount += 1;
      }
    }
    return {
      schema_version: S.VERSION,
      generated_at: new Date().toISOString(),
      total: reports.length,
      by_status: byStatus,
      by_dro: byDro,
      by_severity: bySeverity,
      by_day: byDay,
      mean_resolution_ms: resolvedCount ? Math.round(resolvedTotalMs / resolvedCount) : null,
      resolved_count: resolvedCount
    };
  }

  // ---------- Browser download helper ----------
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  window.EXPORT = {
    toCsv: toCsv,
    toJson: toJson,
    toGeoJson: toGeoJson,
    toOpen311: toOpen311,
    toOpen311Services: toOpen311Services,
    toStats: toStats,
    download: download
  };
})();
