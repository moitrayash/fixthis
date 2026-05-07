/* Fix This — canonical data schema (v1.1).
   ----------------------------------------------------------------
   Single source of truth for the Report shape used across:
     - citizen flow (app.js)
     - admin kanban + map (admin.js)
     - public pulse (pulse.html)
     - exports (export.js -> CSV / JSON / GeoJSON / Open311)
     - third-party integrations (Tableau, PowerBI, Grafana, Metabase)

   This module is pure: no DOM, no Firestore, no network. It defines
   types, validates inputs, and normalizes payloads on the way in/out
   of storage so every consumer sees the same shape.

   v1.1: hardened legacy-doc compatibility — accepts `geo`/`lon` for
   location, `meta` for metadata, `emergency: true` -> severity, and
   lowercases enum string values ("Resolved" -> "resolved").
*/
(function () {
  "use strict";

  // ---------- Enums ----------
  const Status = Object.freeze({
    OPEN:        "open",
    IN_PROGRESS: "in_progress",
    RESOLVED:    "resolved",
    CLOSED:      "closed"
  });

  const Severity = Object.freeze({
    LOW:       "low",
    MEDIUM:    "medium",
    HIGH:      "high",
    EMERGENCY: "emergency"
  });

  const Source = Object.freeze({
    CITIZEN_WEB: "citizen_web",
    ADMIN:       "admin",
    API:         "api",
    IMPORT:      "import"
  });

  const DRO_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;
  const ID_PATTERN  = /^FIX-\d{6}-[A-Z0-9]{4}$/;

  // ---------- Field spec ----------
  const FIELDS = {
    id:             { type: "string", required: true,  validate: v => ID_PATTERN.test(v) || "id must match FIX-YYMMDD-XXXX" },
    schema_version: { type: "number", required: true,  default: 1 },
    status:         { type: "string", required: true,  default: Status.OPEN,    enum: Object.values(Status) },
    severity:       { type: "string", required: true,  default: Severity.MEDIUM, enum: Object.values(Severity) },
    dro:            { type: "string", required: true,  default: "GENERAL",      validate: v => DRO_PATTERN.test(v) || "dro must be uppercase identifier" },
    title:          { type: "string", required: false, default: "" },
    description:    { type: "string", required: true,  default: "" },
    location: {
      type: "object", required: false, default: null,
      shape: {
        lat:      { type: "number", required: true },
        lng:      { type: "number", required: true },
        accuracy: { type: "number", required: false, default: null },
        address:  { type: "string", required: false, default: "" }
      }
    },
    photo:        { type: "string",  required: false, default: null },
    photo_meta:   { type: "object",  required: false, default: null },
    photo_taken_at: { type: "string", required: false, default: null },
    owner: {
      type: "object", required: false, default: null,
      shape: {
        scope: { type: "string", required: true },
        email: { type: "string", required: false, default: "" },
        phone: { type: "string", required: false, default: "" }
      }
    },
    reporter: {
      type: "object", required: false, default: null,
      shape: {
        anonymous: { type: "boolean", required: true,  default: true },
        name:      { type: "string",  required: false, default: "" },
        contact:   { type: "string",  required: false, default: "" }
      }
    },
    source:       { type: "string",  required: true,  default: Source.CITIZEN_WEB, enum: Object.values(Source) },
    tags:         { type: "array",   required: false, default: [] },
    classification:{ type: "object", required: false, default: null },
    created_at:   { type: "string",  required: true,  default: () => new Date().toISOString() },
    updated_at:   { type: "string",  required: true,  default: () => new Date().toISOString() },
    resolved_at:  { type: "string",  required: false, default: null },
    history:      { type: "array",   required: false, default: [] },
    metadata:     { type: "object",  required: false, default: null }
  };

  // ---------- Helpers ----------
  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  function asIso(v) {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "string") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof v === "number") return new Date(v).toISOString();
    if (v instanceof Date) return v.toISOString();
    if (v && typeof v.toDate === "function") return v.toDate().toISOString();
    return null;
  }

  function defaultFor(spec) {
    return typeof spec.default === "function" ? spec.default() : spec.default;
  }

  // ---------- validate(report) -> { valid, errors[] } ----------
  function validate(report) {
    const errors = [];
    if (!report || typeof report !== "object") {
      return { valid: false, errors: ["report must be an object"] };
    }
    for (const key in FIELDS) {
      const spec = FIELDS[key];
      const v = report[key];
      const present = v !== undefined && v !== null;
      if (spec.required && !present && spec.default === undefined) { errors.push(key + " is required"); continue; }
      if (!present) continue;
      const actual = typeOf(v);
      if (spec.type !== actual && !(spec.type === "object" && actual === "null")) {
        errors.push(key + " expected " + spec.type + ", got " + actual);
        continue;
      }
      if (spec.enum && spec.enum.indexOf(v) === -1) errors.push(key + " must be one of " + spec.enum.join("|"));
      if (typeof spec.validate === "function") {
        const r = spec.validate(v);
        if (r !== true) errors.push(typeof r === "string" ? r : (key + " failed validation"));
      }
      if (spec.shape && actual === "object") {
        for (const sk in spec.shape) {
          const ss = spec.shape[sk];
          const sv = v[sk];
          if (ss.required && (sv === undefined || sv === null)) { errors.push(key + "." + sk + " is required"); continue; }
          if (sv !== undefined && sv !== null && typeOf(sv) !== ss.type) errors.push(key + "." + sk + " expected " + ss.type);
        }
      }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // ---------- normalize(input) -> Report ----------
  function normalize(input) {
    const r = {};
    const src = input || {};

    // legacy -> canonical aliases (top-level field renames)
    const aliases = {
      photoMeta:    "photo_meta",
      takenAt:      "photo_taken_at",
      photoTakenAt: "photo_taken_at",
      createdAt:    "created_at",
      updatedAt:    "updated_at",
      resolvedAt:   "resolved_at",
      reporterMeta: "metadata",
      meta:         "metadata",
      geo:          "location"
    };
    const merged = Object.assign({}, src);
    for (const a in aliases) {
      if (merged[a] !== undefined && merged[aliases[a]] === undefined) merged[aliases[a]] = merged[a];
    }
    // Inside location: legacy `lon` -> `lng`; tolerate stray fields like `source`.
    if (merged.location && typeof merged.location === "object") {
      const loc = Object.assign({}, merged.location);
      if (loc.lng === undefined && loc.lon !== undefined) loc.lng = loc.lon;
      merged.location = loc;
    }
    // Lowercase enum string values so legacy "Resolved" / "OPEN" pass enum checks.
    for (const k in FIELDS) {
      const spec = FIELDS[k];
      if (spec.enum && typeof merged[k] === "string") merged[k] = merged[k].toLowerCase();
    }
    // Legacy `emergency: true` flag -> severity: "emergency".
    if (merged.emergency === true && !merged.severity) merged.severity = "emergency";

    for (const key in FIELDS) {
      const spec = FIELDS[key];
      let v = merged[key];

      if (key === "created_at" || key === "updated_at" || key === "resolved_at" || key === "photo_taken_at") {
        const iso = asIso(v);
        v = iso !== null ? iso : (v === undefined ? undefined : v);
      }

      if (v === undefined || v === null) {
        if (spec.required)             r[key] = defaultFor(spec);
        else if (spec.default !== undefined) r[key] = defaultFor(spec);
        else                           r[key] = null;
        continue;
      }

      if (spec.shape && typeof v === "object" && !Array.isArray(v)) {
        const nested = {};
        for (const sk in spec.shape) {
          const ss = spec.shape[sk];
          const nv = v[sk];
          if (nv === undefined || nv === null) nested[sk] = ss.default !== undefined ? defaultFor(ss) : null;
          else nested[sk] = nv;
        }
        r[key] = nested;
      } else {
        r[key] = v;
      }
    }

    if (r.status === Status.RESOLVED && !r.resolved_at) r.resolved_at = r.updated_at || new Date().toISOString();
    return r;
  }

  // ---------- toOpen311(report) ----------
  function toOpen311(r) {
    const statusMap = { open: "open", in_progress: "open", resolved: "closed", closed: "closed" };
    return {
      service_request_id: r.id,
      status:             statusMap[r.status] || "open",
      status_notes:       r.status === "in_progress" ? "Being worked on" : "",
      service_name:       r.dro,
      service_code:       r.dro,
      description:        r.description || "",
      requested_datetime: r.created_at,
      updated_datetime:   r.updated_at,
      address:            (r.location && r.location.address) || "",
      lat:                r.location ? r.location.lat : null,
      long:               r.location ? r.location.lng : null,
      media_url:          (r.photo && /^https?:/.test(r.photo)) ? r.photo : null
    };
  }

  // ---------- toGeoJsonFeature(report) ----------
  function toGeoJsonFeature(r) {
    if (!r.location || r.location.lat == null || r.location.lng == null) return null;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.location.lng, r.location.lat] },
      properties: {
        id: r.id,
        status: r.status,
        severity: r.severity,
        dro: r.dro,
        description: r.description,
        created_at: r.created_at,
        updated_at: r.updated_at,
        photo_taken_at: r.photo_taken_at,
        owner_scope: r.owner ? r.owner.scope : null
      }
    };
  }

  // ---------- toFlatRow(report) ----------
  function toFlatRow(r) {
    return {
      id: r.id,
      status: r.status,
      severity: r.severity,
      dro: r.dro,
      title: r.title || "",
      description: r.description || "",
      lat:       r.location ? r.location.lat : "",
      lng:       r.location ? r.location.lng : "",
      address:   r.location ? (r.location.address || "") : "",
      accuracy:  r.location ? (r.location.accuracy || "") : "",
      owner_scope: r.owner ? r.owner.scope : "",
      owner_email: r.owner ? r.owner.email : "",
      owner_phone: r.owner ? r.owner.phone : "",
      reporter_anonymous: r.reporter ? r.reporter.anonymous : true,
      source: r.source,
      photo_taken_at: r.photo_taken_at || "",
      created_at: r.created_at,
      updated_at: r.updated_at,
      resolved_at: r.resolved_at || ""
    };
  }

  // ---------- Status transitions ----------
  const TRANSITIONS = {
    open:        ["in_progress", "resolved", "closed"],
    in_progress: ["resolved", "open", "closed"],
    resolved:    ["closed", "in_progress"],
    closed:      ["open"]
  };
  function canTransition(from, to) {
    return Boolean(TRANSITIONS[from] && TRANSITIONS[from].indexOf(to) !== -1);
  }

  window.SCHEMA = {
    VERSION: 1,
    Status: Status, Severity: Severity, Source: Source,
    FIELDS: FIELDS,
    validate: validate, normalize: normalize,
    toOpen311: toOpen311, toGeoJsonFeature: toGeoJsonFeature, toFlatRow: toFlatRow,
    canTransition: canTransition, TRANSITIONS: TRANSITIONS
  };
})();
