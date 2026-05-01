/* Fix This — admin / city-portal controller
   Two-step login: email is checked against employee directory.
   - unknown email → soft error; after 3 attempts, "tell Fix This" support form
     (with optional screenshot upload).
   - known email → password prompt → scoped dashboard.
   - master scope ('ALL') sees everything; otherwise filtered to their DRO.
*/

(() => {
  const root = document.getElementById("root");
  const who = document.getElementById("who");
  const SESSION_KEY = "fixthis_admin_session_v1";

  // ---------- helpers ----------
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function fmtDate(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
           d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }
  function setSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  // ---------- login ----------
  function loginScreen(opts = {}) {
    let attempts = opts.attempts || 0;
    let stage = opts.stage || "email";   // 'email' | 'password' | 'support'
    let pendingEmployee = opts.employee || null;
    let lastError = opts.error || "";
    let lastEmail = opts.email || "";

    function render() {
      root.innerHTML = "";
      let body;
      if (stage === "support") {
        body = el(`
          <div class="login">
            <div class="card">
              <h1>Tell us what's wrong</h1>
              <p>The email isn't recognized. Send us a note and we'll sort it out.</p>
              <label>Your email</label>
              <input id="supEmail" type="email" value="${escapeHtml(lastEmail)}" />
              <label>What's happening?</label>
              <textarea id="supMsg" rows="4" style="width:100%;padding:14px;border:2px solid var(--line);border-radius:12px;background:#fff;outline:none;font-size:16px;margin-bottom:14px;font-family:inherit"></textarea>
              <label>Screenshot (optional)</label>
              <input id="supShot" type="file" accept="image/*" style="margin-bottom:14px" />
              <button class="primary" id="supSend">Send</button>
              <button id="supBack" style="margin-top:10px;width:100%;padding:14px;background:transparent;color:var(--muted)">← back</button>
            </div>
          </div>
        `);
        body.querySelector("#supSend").addEventListener("click", () => {
          // For prototype we just save it locally — replace with real submission later.
          const reports = JSON.parse(localStorage.getItem("fixthis_admin_support_v1") || "[]");
          const fileName = body.querySelector("#supShot").files[0]?.name || "";
          reports.unshift({
            ts: Date.now(),
            email: body.querySelector("#supEmail").value,
            msg: body.querySelector("#supMsg").value,
            screenshot: fileName
          });
          localStorage.setItem("fixthis_admin_support_v1", JSON.stringify(reports));
          alert("Thanks. We'll be in touch within one business day. If this is urgent, reach the city directly.");
          stage = "email"; lastError = ""; render();
        });
        body.querySelector("#supBack").addEventListener("click", () => { stage = "email"; render(); });
      } else if (stage === "password") {
        body = el(`
          <div class="login">
            <div class="card">
              <h1>${escapeHtml(pendingEmployee.name)}</h1>
              <p>${escapeHtml(pendingEmployee.role)} · ${escapeHtml(pendingEmployee.email)}</p>
              ${lastError ? `<div class="err">${escapeHtml(lastError)}</div>` : ""}
              <label>Password</label>
              <input id="pw" type="password" autofocus />
              <button class="primary" id="pwSubmit">Sign in</button>
              <button id="pwBack" style="margin-top:10px;width:100%;padding:14px;background:transparent;color:var(--muted)">← different email</button>
            </div>
          </div>
        `);
        body.querySelector("#pwSubmit").addEventListener("click", tryPassword);
        body.querySelector("#pw").addEventListener("keydown", e => { if (e.key === "Enter") tryPassword(); });
        body.querySelector("#pwBack").addEventListener("click", () => {
          stage = "email"; pendingEmployee = null; lastError = ""; render();
        });
      } else {
        body = el(`
          <div class="login">
            <div class="card">
              <h1>City portal</h1>
              <p>Authorized municipal & university staff only.</p>
              ${lastError ? `<div class="err">${escapeHtml(lastError)}</div>` : ""}
              <label>Work email</label>
              <input id="emailInp" type="email" value="${escapeHtml(lastEmail)}" autofocus placeholder="you@cityofithaca.org" />
              <button class="primary" id="emailSubmit">Continue</button>
              ${attempts >= 3 ? `<button id="supLink" style="margin-top:10px;width:100%;padding:14px;background:transparent;color:var(--red);font-weight:600">Email not recognized? Tell Fix This →</button>` : ""}
              <div class="help">
                <strong>Demo logins</strong>
                <div class="hints">admin@fixthis.local / city2024 (master)<br/>roads@cityofithaca.org / roads2024<br/>scl-facilities@cornell.edu / build2024<br/>(and one per department — see storage.js)</div>
              </div>
            </div>
          </div>
        `);
        body.querySelector("#emailSubmit").addEventListener("click", tryEmail);
        body.querySelector("#emailInp").addEventListener("keydown", e => { if (e.key === "Enter") tryEmail(); });
        const sl = body.querySelector("#supLink");
        if (sl) sl.addEventListener("click", () => { stage = "support"; render(); });
      }
      root.appendChild(body);
    }

    function tryEmail() {
      const inp = root.querySelector("#emailInp");
      const email = (inp.value || "").trim();
      lastEmail = email;
      const emp = window.STORAGE.findEmployee(email);
      if (!emp) {
        attempts += 1;
        lastError = `That email isn't authorized.${attempts >= 3 ? " Tap the link below to tell us why you should have access." : ""}`;
        render();
        return;
      }
      pendingEmployee = emp;
      stage = "password";
      lastError = "";
      render();
    }

    function tryPassword() {
      const pw = root.querySelector("#pw").value;
      const emp = window.STORAGE.checkPassword(pendingEmployee.email, pw);
      if (!emp) {
        lastError = "Wrong password.";
        render();
        return;
      }
      setSession({ email: emp.email, scope: emp.scope, name: emp.name, role: emp.role });
      boot();
    }

    render();
  }

  // ---------- dashboard ----------
  function dashboard(session) {
    who.innerHTML = `<strong>${escapeHtml(session.name)}</strong>${escapeHtml(session.role)} · <a href="#" id="logout">sign out</a>`;
    who.querySelector("#logout").addEventListener("click", e => {
      e.preventDefault(); clearSession(); window.location.reload();
    });

    const allReports = window.STORAGE.list();
    const isMaster = session.scope === "ALL";
    const myReports = isMaster ? allReports : allReports.filter(r => r.dro === session.scope);

    let filterDro = isMaster ? "" : session.scope;
    let filterStatus = "";
    let q = "";

    function statusClass(s) {
      return s === "Resolved" ? "resolved" : s === "In Progress" ? "progress" : "open";
    }

    function renderMain() {
      const filtered = myReports.filter(r => {
        if (filterDro && r.dro !== filterDro) return false;
        if (filterStatus && r.status !== filterStatus) return false;
        if (q) {
          const t = (r.description + " " + (r.extra || "") + " " + r.id).toLowerCase();
          if (!t.includes(q.toLowerCase())) return false;
        }
        return true;
      });

      const counts = {
        open: myReports.filter(r => r.status === "Open").length,
        progress: myReports.filter(r => r.status === "In Progress").length,
        resolved: myReports.filter(r => r.status === "Resolved").length,
        urgent: myReports.filter(r => r.emergency).length,
      };

      const droOptions = isMaster
        ? `<option value="">All departments</option>` + window.ROUTING.list().map(d => `<option value="${d.key}" ${filterDro===d.key?"selected":""}>${escapeHtml(d.label)}</option>`).join("")
        : `<option value="${session.scope}" selected>${escapeHtml(window.ROUTING.get(session.scope).label)}</option>`;

      root.innerHTML = `
        <main>
          <div class="toolbar">
            <input class="search" id="searchInp" placeholder="Search reports…" value="${escapeHtml(q)}" />
            <select id="droSel" ${isMaster?"":"disabled"}>${droOptions}</select>
            <select id="statusSel">
              <option value="">All statuses</option>
              <option value="Open" ${filterStatus==="Open"?"selected":""}>Open</option>
              <option value="In Progress" ${filterStatus==="In Progress"?"selected":""}>In Progress</option>
              <option value="Resolved" ${filterStatus==="Resolved"?"selected":""}>Resolved</option>
            </select>
            <div class="stats">
              <div class="stat"><strong>${counts.open}</strong>open</div>
              <div class="stat"><strong>${counts.progress}</strong>in progress</div>
              <div class="stat"><strong>${counts.resolved}</strong>resolved</div>
              ${counts.urgent ? `<div class="stat" style="background:#fee2e2;border-color:#fecaca"><strong style="color:#b91c1c">${counts.urgent}</strong>urgent</div>` : ""}
            </div>
          </div>
          ${filtered.length === 0 ? `
            <div class="empty">
              <h3>No reports yet</h3>
              <p>${myReports.length === 0 ? "Submit one from the citizen app to see it here." : "Adjust filters to see more."}</p>
            </div>
          ` : `<div class="grid">${filtered.map(cardHtml).join("")}</div>`}
        </main>
      `;

      root.querySelector("#searchInp").addEventListener("input", e => { q = e.target.value; renderMain(); });
      root.querySelector("#droSel").addEventListener("change", e => { filterDro = e.target.value; renderMain(); });
      root.querySelector("#statusSel").addEventListener("change", e => { filterStatus = e.target.value; renderMain(); });

      root.querySelectorAll(".card .status-sel").forEach(sel => {
        sel.addEventListener("change", e => {
          const id = sel.dataset.id;
          window.STORAGE.update(id, { status: e.target.value });
          renderMain();
        });
      });
      root.querySelectorAll(".card img").forEach(img => {
        img.addEventListener("click", () => openModal(img.src));
      });
      root.querySelectorAll(".card .copy-email").forEach(b => {
        b.addEventListener("click", () => {
          navigator.clipboard.writeText(b.dataset.email);
          b.textContent = "✓ copied";
          setTimeout(() => b.textContent = "Copy email", 1400);
        });
      });
    }

    function cardHtml(r) {
      const dro = window.ROUTING.get(r.dro);
      const owner = r.owner || dro.owners[0];
      const mapsUrl = r.geo
        ? `https://www.google.com/maps?q=${r.geo.lat},${r.geo.lon}`
        : null;
      return `
        <article class="card">
          <div class="img">${r.photo
            ? `<img src="${r.photo}" alt="" loading="lazy" />`
            : `<span>no photo</span>`}</div>
          <div class="body">
            <div class="tags">
              <span class="tag" style="background:${dro.color}22;color:${dro.color}">${dro.icon} ${escapeHtml(dro.label)}</span>
              <span class="tag ${statusClass(r.status)}">${escapeHtml(r.status)}</span>
              ${r.emergency ? `<span class="tag urgent">URGENT · ${escapeHtml(r.emergency)}</span>` : ""}
            </div>
            <p class="desc">${escapeHtml(r.description)}</p>
            ${r.extra ? `<p class="desc" style="color:var(--muted);font-size:13px">${escapeHtml(r.extra)}</p>` : ""}
            <div class="meta">
              <span><strong>${escapeHtml(r.id)}</strong> · ${fmtDate(r.createdAt)}</span>
              <span>→ ${escapeHtml(owner.scope)}${owner.email ? ` · <a href="mailto:${owner.email}?subject=Fix%20This%20ticket%20${r.id}&body=${encodeURIComponent('Ticket: ' + r.id + '\nDept: ' + dro.label + '\n\n' + r.description)}">${owner.email}</a>` : ""}</span>
              ${mapsUrl ? `<span>📍 <a href="${mapsUrl}" target="_blank" rel="noopener">view on Google Maps</a> · ${r.geo.lat.toFixed(5)}, ${r.geo.lon.toFixed(5)} (${r.geo.source})</span>` : `<span style="color:var(--warn)">📍 no location</span>`}
            </div>
          </div>
          <div class="actions">
            <select class="status-sel" data-id="${r.id}">
              <option ${r.status==="Open"?"selected":""}>Open</option>
              <option ${r.status==="In Progress"?"selected":""}>In Progress</option>
              <option ${r.status==="Resolved"?"selected":""}>Resolved</option>
            </select>
            ${owner.email ? `<button class="copy-email" data-email="${owner.email}">Copy email</button>` : ""}
          </div>
        </article>
      `;
    }

    function openModal(src) {
      const m = el(`
        <div class="modal" id="m">
          <button class="close">close</button>
          <img src="${src}" />
        </div>`);
      m.addEventListener("click", () => m.remove());
      document.body.appendChild(m);
    }

    renderMain();
  }

  // ---------- boot ----------
  function boot() {
    const s = getSession();
    if (s) dashboard(s);
    else { who.innerHTML = ""; loginScreen(); }
  }

  boot();
})();
