/* Fix This — storage layer (v2.1).
   ----------------------------------------------------------------
   Schema-validated, adapter-based persistence. Public surface kept
   backward-compatible with v1 (app.js / admin.js need no changes),
   plus new query/aggregate/export hooks for the export.js module
   and third-party integrations.

   v2.1: removed server-side orderBy("created_at") — Firestore filters
   out docs that lack the field, which dropped every legacy doc. Now
   we orderBy nothing and sort client-side so both v1 (createdAt) and
   v2 (created_at) records come through.
*/
(function () {
  "use strict";

  if (!window.SCHEMA) {
    console.error("storage.js: SCHEMA is missing — load assets/schema.js first");
    return;
  }
  const S = window.SCHEMA;

  // ---------- Firebase config (public client SDK keys; safe to commit) ----------
  const firebaseConfig = {
    apiKey: "AIzaSyDeaFx4p2XtM191GOj-Ehlr2hCz2A9Ua_o",
    authDomain: "fixthis-17c64.firebaseapp.com",
    projectId: "fixthis-17c64",
    storageBucket: "fixthis-17c64.firebasestorage.app",
    messagingSenderId: "325058467941",
    appId: "1:325058467941:web:43596c243ab37a0fb34e8c"
  };
  const SDK_BASE = "https://www.gstatic.com/firebasejs/10.13.2/";
  const COLL = "reports";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ---------- Photo compression (Firestore 1MB doc limit) ----------
  function compressDataUrl(dataUrl, maxWidth, quality) {
    return new Promise(function (resolve) {
      if (!dataUrl) return resolve(null);
      const img = new Image();
      img.onload = function () {
        const ratio = Math.min(1, (maxWidth || 800) / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(c.toDataURL("image/jpeg", quality || 0.72)); }
        catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  // ---------- Legacy alias decorator ----------
  // New canonical fields are snake_case. Old consumers read camelCase.
  // Decorate every read with both names so nothing breaks.
  const ALIAS_PAIRS = [
    ["created_at",     "createdAt"],
    ["updated_at",     "updatedAt"],
    ["resolved_at",    "resolvedAt"],
    ["photo_taken_at", "takenAt"],
    ["photo_taken_at", "photoTakenAt"],
    ["photo_meta",     "photoMeta"]
  ];
  function decorate(r) {
    if (!r) return r;
    for (let i = 0; i < ALIAS_PAIRS.length; i++) {
      const canon = ALIAS_PAIRS[i][0], legacy = ALIAS_PAIRS[i][1];
      if (r[canon] !== undefined && r[legacy] === undefined) r[legacy] = r[canon];
    }
    // Also keep the legacy `geo` shape alongside `location` so older admin.js
    // code that looks at r.geo.lat / r.geo.lon doesn't break.
    if (r.location && !r.geo) {
      r.geo = { lat: r.location.lat, lng: r.location.lng, lon: r.location.lng };
    }
    return r;
  }

  // ---------- Adapters ----------
  function FirestoreAdapter() {
    let dbReady = (async function () {
      await loadScript(SDK_BASE + "firebase-app-compat.js");
      await loadScript(SDK_BASE + "firebase-firestore-compat.js");
      firebase.initializeApp(firebaseConfig);
      return firebase.firestore();
    })();
    return {
      name: "firestore",
      ready: function () { return dbReady; },
      subscribe: function (onSnap) {
        // No server-side orderBy: legacy docs use `createdAt`, new docs use
        // `created_at`. Firestore filters out docs lacking the orderBy field,
        // so we sort client-side after the snapshot lands.
        return dbReady.then(function (db) {
          return db.collection(COLL).onSnapshot(function (snap) {
            const docs = snap.docs.map(function (d) { return d.data(); });
            docs.sort(function (a, b) {
              const ta = +new Date(a.created_at || a.createdAt || 0);
              const tb = +new Date(b.created_at || b.createdAt || 0);
              return tb - ta;
            });
            onSnap(docs);
          }, function (err) {
            console.error("Firestore subscription error", err);
          });
        });
      },
      put: async function (report) {
        const db = await dbReady;
        await db.collection(COLL).doc(report.id).set(report);
      },
      patch: async function (id, partial) {
        const db = await dbReady;
        await db.collection(COLL).doc(id).set(partial, { merge: true });
      }
    };
  }

  function LocalAdapter() {
    const KEY = "fixthis_reports_v3";
    let cache = [];
    try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) {}
    let cb = null;
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }
    return {
      name: "local",
      ready: function () { return Promise.resolve(); },
      subscribe: function (onSnap) { cb = onSnap; onSnap(cache.slice()); return function () { cb = null; }; },
      put: async function (report) {
        const i = cache.findIndex(function (r) { return r.id === report.id; });
        if (i === -1) cache.unshift(report); else cache[i] = report;
        persist(); if (cb) cb(cache.slice());
      },
      patch: async function (id, partial) {
        const i = cache.findIndex(function (r) { return r.id === id; });
        if (i === -1) return;
        cache[i] = Object.assign({}, cache[i], partial);
        persist(); if (cb) cb(cache.slice());
      }
    };
  }

  let adapter;
  try { adapter = FirestoreAdapter(); }
  catch (e) { console.warn("Firestore unavailable, using local adapter", e); adapter = LocalAdapter(); }

  // ---------- Cache + listeners ----------
  let cache = [];
  let listeners = [];
  function notify() { listeners.forEach(function (fn) { try { fn(cache); } catch (e) {} }); }
  function onChange(fn) { listeners.push(fn); fn(cache); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }

  adapter.subscribe(function (rawDocs) {
    cache = rawDocs.map(function (d) { return decorate(S.normalize(d)); });
    notify();
  });

  setTimeout(function () {
    if (cache.length === 0 && adapter.name === "firestore") {
      try {
        const raw = JSON.parse(localStorage.getItem("fixthis_reports_v3") || "[]");
        if (raw.length) {
          cache = raw.map(function (d) { return decorate(S.normalize(d)); });
          notify();
        }
      } catch (e) {}
    }
  }, 4000);

  // ---------- Public read API ----------
  function list(filter) {
    if (!filter) return cache.slice();
    return cache.filter(function (r) { return matches(r, filter); });
  }
  function get(id) { return cache.find(function (r) { return r.id === id; }); }

  function query(spec) {
    spec = spec || {};
    return cache.filter(function (r) {
      if (!matches(r, spec)) return false;
      if (spec.since && new Date(r.created_at) < new Date(spec.since)) return false;
      if (spec.until && new Date(r.created_at) > new Date(spec.until)) return false;
      if (spec.owner_scope && (!r.owner || r.owner.scope !== spec.owner_scope)) return false;
      if (spec.q) {
        const q = String(spec.q).toLowerCase();
        const hay = ((r.description || "") + " " + (r.title || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }
  function matches(r, f) {
    if (f.dro && r.dro !== f.dro) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.severity && r.severity !== f.severity) return false;
    return true;
  }

  function countBy(field) {
    const out = {};
    for (let i = 0; i < cache.length; i++) {
      const k = cache[i][field] == null ? "(none)" : String(cache[i][field]);
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }
  function stats() {
    return {
      total: cache.length,
      by_status: countBy("status"),
      by_dro: countBy("dro"),
      by_severity: countBy("severity"),
      generated_at: new Date().toISOString()
    };
  }

  // ---------- Public write API ----------
  function save(input) {
    const report = S.normalize(input);
    const v = S.validate(report);
    if (!v.valid) {
      console.error("STORAGE.save validation failed", v.errors, report);
      throw new Error("Invalid report: " + v.errors.join("; "));
    }
    const decorated = decorate(Object.assign({}, report));
    cache = [decorated].concat(cache.filter(function (x) { return x.id !== report.id; }));
    notify();

    (async function () {
      const toSave = Object.assign({}, report);
      if (toSave.photo && /^data:/.test(toSave.photo)) {
        const compressed = await compressDataUrl(toSave.photo, 900, 0.72);
        toSave.photo = compressed;
        if (toSave.photo_meta) toSave.photo_meta.compressedSize = (compressed || "").length;
      }
      try {
        await adapter.put(toSave);
      } catch (e) {
        console.error("STORAGE.save adapter error", e);
        try {
          const arr = JSON.parse(localStorage.getItem("fixthis_reports_v3") || "[]");
          arr.unshift(toSave);
          localStorage.setItem("fixthis_reports_v3", JSON.stringify(arr));
        } catch (e2) {}
      }
    })();
    return decorated;
  }

  function update(id, patch) {
    const i = cache.findIndex(function (r) { return r.id === id; });
    if (i === -1) return null;
    const next = Object.assign({}, cache[i], patch, { updated_at: new Date().toISOString() });
    if (patch.status === S.Status.RESOLVED && !next.resolved_at) next.resolved_at = next.updated_at;
    cache[i] = decorate(S.normalize(next));
    notify();
    const wirePatch = Object.assign({}, patch, {
      updated_at: cache[i].updated_at,
      resolved_at: cache[i].resolved_at || null
    });
    adapter.patch(id, wirePatch).catch(function (e) { console.error("STORAGE.update adapter error", e); });
    return cache[i];
  }

  function generateId() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    const datePart = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "FIX-" + datePart + "-" + rand;
  }

  // ---------- Employees ----------
  const EMP_KEY = "fixthis_employees_v1";
  const DEFAULT_EMPLOYEES = [
    { email: "admin@fixthis.local",        password: "city2024",    scope: "ALL",       name: "Master Admin",                 role: "Citywide Coordinator" },
    { email: "roads@cityofithaca.org",     password: "roads2024",   scope: "ROADS",     name: "Ithaca DPW Roads",             role: "Streets Supervisor" },
    { email: "water@cityofithaca.org",     password: "water2024",   scope: "WATER",     name: "Ithaca Water and Sewer",       role: "Operations Lead" },
    { email: "dpw@cityofithaca.org",       password: "waste2024",   scope: "WASTE",     name: "Ithaca Sanitation",            role: "Operations Lead" },
    { email: "parks@cityofithaca.org",     password: "parks2024",   scope: "PARKS",     name: "Ithaca Parks",                 role: "Forestry and Parks" },
    { email: "tcat@tcatmail.com",          password: "transit2024", scope: "TRANSIT",   name: "TCAT Operations",              role: "Customer Service" },
    { email: "fcs-help@cornell.edu",       password: "lights2024",  scope: "LIGHTING",  name: "Cornell FCS Lighting",         role: "Facilities" },
    { email: "scl-facilities@cornell.edu", password: "build2024",   scope: "BUILDINGS", name: "Cornell Housing Maintenance",  role: "Facilities Manager" },
    { email: "itservicedesk@cornell.edu",  password: "it2024",      scope: "IT",        name: "Cornell IT Service Desk",      role: "Triage" },
    { email: "info@spcaonline.com",        password: "spca2024",    scope: "ANIMAL",    name: "SPCA Tompkins",                role: "Animal Control" },
    { email: "askehs@cornell.edu",         password: "ehs2024",     scope: "SAFETY",    name: "Cornell EHS",                  role: "Health and Safety" }
  ];
  function _readEmployees() {
    try {
      const raw = localStorage.getItem(EMP_KEY);
      if (!raw) { localStorage.setItem(EMP_KEY, JSON.stringify(DEFAULT_EMPLOYEES)); return DEFAULT_EMPLOYEES; }
      return JSON.parse(raw);
    } catch (e) { return DEFAULT_EMPLOYEES; }
  }
  function findEmployee(email) {
    const e = (email || "").trim().toLowerCase();
    return _readEmployees().find(function (x) { return x.email.toLowerCase() === e; });
  }
  function checkPassword(email, password) {
    const emp = findEmployee(email);
    if (!emp) return null;
    if (emp.password !== password) return null;
    return emp;
  }

  function captureMetadata() {
    return {
      ts: Date.now(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      ua: navigator.userAgent,
      lang: navigator.language,
      platform: navigator.platform,
      screen: screen.width + "x" + screen.height + "@" + (window.devicePixelRatio || 1),
      viewport: innerWidth + "x" + innerHeight,
      online: navigator.onLine,
      referrer: document.referrer || ""
    };
  }

  window.STORAGE = {
    list: list, get: get, save: save, update: update, generateId: generateId,
    findEmployee: findEmployee, checkPassword: checkPassword,
    captureMetadata: captureMetadata,
    onChange: onChange,
    backend: adapter.name,
    schema: S, query: query, stats: stats, countBy: countBy
  };
})();
