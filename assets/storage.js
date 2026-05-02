/* Fix This — storage adapter (Firestore edition).
   - Reports synced across devices via Cloud Firestore (collection: 'reports')
   - Real-time listener: admin kanban auto-updates when new tickets arrive
   - Photos compressed to ~100KB before upload to fit Firestore's 1MB doc limit
   - Employee directory stays local (no cloud auth needed for demo)
   - Same synchronous API surface as before so app.js / admin.js need no changes
*/
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDeaFx4p2XtM191GOj-Ehlr2hCz2A9Ua_o",
    authDomain: "fixthis-17c64.firebaseapp.com",
    projectId: "fixthis-17c64",
    storageBucket: "fixthis-17c64.firebasestorage.app",
    messagingSenderId: "325058467941",
    appId: "1:325058467941:web:43596c243ab37a0fb34e8c"
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const SDK_BASE = "https://www.gstatic.com/firebasejs/10.13.2/";
  let dbReady = (async function () {
    await loadScript(SDK_BASE + "firebase-app-compat.js");
    await loadScript(SDK_BASE + "firebase-firestore-compat.js");
    firebase.initializeApp(firebaseConfig);
    return firebase.firestore();
  })();

  const COLL = "reports";
  let cache = [];
  let listeners = [];

  function notify() { listeners.forEach(function (fn) { try { fn(cache); } catch (e) {} }); }
  function onChange(fn) { listeners.push(fn); fn(cache); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }

  dbReady.then(function (db) {
    db.collection(COLL).orderBy("createdAt", "desc").onSnapshot(function (snap) {
      cache = snap.docs.map(function (d) { return d.data(); });
      notify();
    }, function (err) { console.error("Firestore subscription error", err); });
  }).catch(function (e) {
    console.error("Firebase init failed; falling back to localStorage", e);
    try {
      cache = JSON.parse(localStorage.getItem("fixthis_reports_v3") || "[]");
      notify();
    } catch (e2) {}
  });

  function compressDataUrl(dataUrl, maxWidth, quality) {
    return new Promise(function (resolve) {
      if (!dataUrl) return resolve(null);
      const img = new Image();
      img.onload = function () {
        const ratio = Math.min(1, (maxWidth || 800) / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL("image/jpeg", quality || 0.72)); }
        catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function list(filter) {
    if (!filter) return cache.slice();
    return cache.filter(function (r) {
      if (filter.dro && r.dro !== filter.dro) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    });
  }
  function get(id) { return cache.find(function (r) { return r.id === id; }); }

  function save(report) {
    cache = [report].concat(cache);
    notify();
    dbReady.then(async function (db) {
      let toSave = Object.assign({}, report);
      if (toSave.photo) {
        const compressed = await compressDataUrl(toSave.photo, 900, 0.72);
        toSave.photo = compressed;
        if (toSave.photoMeta) toSave.photoMeta.compressedSize = (compressed || "").length;
      }
      try { await db.collection(COLL).doc(report.id).set(toSave); }
      catch (e) {
        console.error("Firestore save failed", e);
        try {
          const arr = JSON.parse(localStorage.getItem("fixthis_reports_v3") || "[]");
          arr.unshift(report);
          localStorage.setItem("fixthis_reports_v3", JSON.stringify(arr));
        } catch (e2) {}
      }
    });
    return report;
  }

  function update(id, patch) {
    const i = cache.findIndex(function (r) { return r.id === id; });
    if (i === -1) return null;
    cache[i] = Object.assign({}, cache[i], patch, { updatedAt: Date.now() });
    notify();
    dbReady.then(function (db) {
      db.collection(COLL).doc(id).set(Object.assign({}, patch, { updatedAt: Date.now() }), { merge: true })
        .catch(function (e) { console.error("Firestore update failed", e); });
    });
    return cache[i];
  }

  function generateId() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    const datePart = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "FIX-" + datePart + "-" + rand;
  }

  const EMP_KEY = "fixthis_employees_v1";
  const DEFAULT_EMPLOYEES = [
    { email: "admin@fixthis.local", password: "city2024", scope: "ALL", name: "Master Admin", role: "Citywide Coordinator" },
    { email: "roads@cityofithaca.org", password: "roads2024", scope: "ROADS", name: "Ithaca DPW \u00b7 Roads", role: "Streets Supervisor" },
    { email: "water@cityofithaca.org", password: "water2024", scope: "WATER", name: "Ithaca Water & Sewer", role: "Operations Lead" },
    { email: "dpw@cityofithaca.org", password: "waste2024", scope: "WASTE", name: "Ithaca Sanitation", role: "Operations Lead" },
    { email: "parks@cityofithaca.org", password: "parks2024", scope: "PARKS", name: "Ithaca Parks", role: "Forestry & Parks" },
    { email: "tcat@tcatmail.com", password: "transit2024", scope: "TRANSIT", name: "TCAT Operations", role: "Customer Service" },
    { email: "fcs-help@cornell.edu", password: "lights2024", scope: "LIGHTING", name: "Cornell FCS \u00b7 Lighting", role: "Facilities" },
    { email: "scl-facilities@cornell.edu", password: "build2024", scope: "BUILDINGS", name: "Cornell Housing Maintenance", role: "Facilities Manager" },
    { email: "itservicedesk@cornell.edu", password: "it2024", scope: "IT", name: "Cornell IT Service Desk", role: "Triage" },
    { email: "info@spcaonline.com", password: "spca2024", scope: "ANIMAL", name: "SPCA Tompkins", role: "Animal Control" },
    { email: "askehs@cornell.edu", password: "ehs2024", scope: "SAFETY", name: "Cornell EHS", role: "Health & Safety" }
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
      referrer: document.referrer || "",
      ipPlaceholder: "(set by server)"
    };
  }

  window.STORAGE = {
    list: list, get: get, save: save, update: update, generateId: generateId,
    findEmployee: findEmployee, checkPassword: checkPassword,
    captureMetadata: captureMetadata,
    onChange: onChange,
    backend: "firestore"
  };
})();
