/* Fix This — storage adapter
   Uses localStorage today. Drop-in replaceable with fetch() to a real API later.
   The contract is small and stable: list, save, update, get.

   Reports captured here may be subpoenaed as evidence — we capture every
   piece of metadata we can without asking the user for anything sensitive.
*/

window.STORAGE = (function () {
  const KEY = "fixthis_reports_v3";
  const EMP_KEY = "fixthis_employees_v1";

  function _read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function _write(arr) {
    localStorage.setItem(KEY, JSON.stringify(arr));
  }

  function list(filter) {
    const all = _read();
    if (!filter) return all;
    return all.filter(r => {
      if (filter.dro && r.dro !== filter.dro) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    });
  }

  function get(id) {
    return _read().find(r => r.id === id);
  }

  function save(report) {
    const all = _read();
    all.unshift(report);
    _write(all);
    return report;
  }

  function update(id, patch) {
    const all = _read();
    const i = all.findIndex(r => r.id === id);
    if (i === -1) return null;
    all[i] = { ...all[i], ...patch, updatedAt: Date.now() };
    _write(all);
    return all[i];
  }

  function generateId() {
    // Short, human-readable ticket ID: FIX-YYMMDD-XXXX
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    const datePart = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `FIX-${datePart}-${rand}`;
  }

  // --- Employee directory (admin login) ---
  // Master master master defaults — replace with API call in production.
  const DEFAULT_EMPLOYEES = [
    // Master admin
    { email: "admin@fixthis.local", password: "city2024", scope: "ALL", name: "Master Admin", role: "Citywide Coordinator" },
    // Per-department dummy logins
    { email: "roads@cityofithaca.org", password: "roads2024", scope: "ROADS", name: "Ithaca DPW · Roads", role: "Streets Supervisor" },
    { email: "water@cityofithaca.org", password: "water2024", scope: "WATER", name: "Ithaca Water & Sewer", role: "Operations Lead" },
    { email: "dpw@cityofithaca.org", password: "waste2024", scope: "WASTE", name: "Ithaca Sanitation", role: "Operations Lead" },
    { email: "parks@cityofithaca.org", password: "parks2024", scope: "PARKS", name: "Ithaca Parks", role: "Forestry & Parks" },
    { email: "tcat@tcatmail.com", password: "transit2024", scope: "TRANSIT", name: "TCAT Operations", role: "Customer Service" },
    { email: "fcs-help@cornell.edu", password: "lights2024", scope: "LIGHTING", name: "Cornell FCS · Lighting", role: "Facilities" },
    { email: "scl-facilities@cornell.edu", password: "build2024", scope: "BUILDINGS", name: "Cornell Housing Maintenance", role: "Facilities Manager" },
    { email: "itservicedesk@cornell.edu", password: "it2024", scope: "IT", name: "Cornell IT Service Desk", role: "Triage" },
    { email: "info@spcaonline.com", password: "spca2024", scope: "ANIMAL", name: "SPCA Tompkins", role: "Animal Control" },
    { email: "askehs@cornell.edu", password: "ehs2024", scope: "SAFETY", name: "Cornell EHS", role: "Health & Safety" },
  ];

  function _readEmployees() {
    try {
      const raw = localStorage.getItem(EMP_KEY);
      if (!raw) {
        localStorage.setItem(EMP_KEY, JSON.stringify(DEFAULT_EMPLOYEES));
        return DEFAULT_EMPLOYEES;
      }
      return JSON.parse(raw);
    } catch (e) {
      return DEFAULT_EMPLOYEES;
    }
  }

  function findEmployee(email) {
    const e = (email || "").trim().toLowerCase();
    return _readEmployees().find(x => x.email.toLowerCase() === e);
  }

  function checkPassword(email, password) {
    const emp = findEmployee(email);
    if (!emp) return null;
    if (emp.password !== password) return null;
    return emp;
  }

  // --- Metadata capture ---
  // Every signal we can passively collect, for evidentiary integrity.
  function captureMetadata() {
    return {
      ts: Date.now(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      ua: navigator.userAgent,
      lang: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
      viewport: `${innerWidth}x${innerHeight}`,
      online: navigator.onLine,
      referrer: document.referrer || "",
      // IP and geo are server-side only; we leave a placeholder.
      ipPlaceholder: "(set by server)",
    };
  }

  return {
    list, get, save, update, generateId,
    findEmployee, checkPassword,
    captureMetadata,
  };
})();
