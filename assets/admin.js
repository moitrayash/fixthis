/* Fix This — admin / city-portal controller (kanban edition)
   Three columns: Open (red) → In Progress (yellow) → Resolved (green)
   Drag-drop on desktop, tap-to-move action sheet on mobile.
   Fixed bugs:
     - Status changes now persist (re-read storage on every render)
     - Copy-email has document.execCommand fallback for HTTP / older browsers
*/

(() => {
  const root = document.getElementById("root");
  const who = document.getElementById("who");
  const SESSION_KEY = "fixthis_admin_session_v1";
  const STATUSES = ["Open", "In Progress", "Resolved"];

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function fmtDate(ms) {
    const d = new Date(ms);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }
  function setSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  function toast(msg, ms) {
    ms = ms || 1800;
    const n = el('<div class="toast">' + escapeHtml(msg) + '</div>');
    document.body.appendChild(n);
    setTimeout(() => n.remove(), ms);
  }

  function copyToClipboard(text) {
    return new Promise((resolve) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => resolve(true), () => resolve(execFallback(text)));
      } else {
        resolve(execFallback(text));
      }
    });
    function execFallback(text) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.setAttribute("readonly", "");
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch { return false; }
    }
  }

  function loginScreen(opts = {}) {
    let attempts = opts.attempts || 0;
    let stage = opts.stage || "email";
    let pendingEmployee = opts.employee || null;
    let lastError = opts.error || "";
    let lastEmail = opts.email || "";

    function render() {
      root.innerHTML = "";
      let body;
      if (stage === "support") {
        body = el('<div class="login"><div class="card"><h1>Tell us what\'s wrong</h1><p>The email isn\'t recognized. Send us a note and we\'ll sort it out.</p><label>Your email</label><input id="supEmail" type="email" value="' + escapeHtml(lastEmail) + '" /><label>What\'s happening?</label><textarea id="supMsg" rows="4" style="width:100%;padding:14px;border:2px solid var(--line);border-radius:12px;background:#fff;outline:none;font-size:16px;margin-bottom:14px;font-family:inherit"></textarea><label>Screenshot (optional)</label><input id="supShot" type="file" accept="image/*" style="margin-bottom:14px" /><button class="primary" id="supSend">Send</button><button id="supBack" style="margin-top:10px;width:100%;padding:14px;background:transparent;color:var(--muted)">← back</button></div></div>');
        body.querySelector("#supSend").addEventListener("click", () => { const reports = JSON.parse(localStorage.getItem("fixthis_admin_support_v1") || "[]"); const fileName = body.querySelector("#supShot").files[0]?.name || ""; reports.unshift({ ts: Date.now(), email: body.querySelector("#supEmail").value, msg: body.querySelector("#supMsg").value, screenshot: fileName }); localStorage.setItem("fixthis_admin_support_v1", JSON.stringify(reports)); alert("Thanks. We'll be in touch within one business day."); stage = "email"; lastError = ""; render(); });
        body.querySelector("#supBack").addEventListener("click", () => { stage = "email"; render(); });
      } else if (stage === "password") {
        body = el('<div class="login"><div class="card"><h1>' + escapeHtml(pendingEmployee.name) + '</h1><p>' + escapeHtml(pendingEmployee.role) + ' · ' + escapeHtml(pendingEmployee.email) + '</p>' + (lastError ? '<div class="err">' + escapeHtml(lastError) + '</div>' : '') + '<label>Password</label><input id="pw" type="password" autofocus /><button class="primary" id="pwSubmit">Sign in</button><button id="pwBack" style="margin-top:10px;width:100%;padding:14px;background:transparent;color:var(--muted)">← different email</button></div></div>');
        body.querySelector("#pwSubmit").addEventListener("click", tryPassword);
        body.querySelector("#pw").addEventListener("keydown", e => { if (e.key === "Enter") tryPassword(); });
        body.querySelector("#pwBack").addEventListener("click", () => { stage = "email"; pendingEmployee = null; lastError = ""; render(); });
      } else {
        body = el('<div class="login"><div class="card"><h1>City portal</h1><p>Authorized municipal & university staff only.</p>' + (lastError ? '<div class="err">' + escapeHtml(lastError) + '</div>' : '') + '<label>Work email</label><input id="emailInp" type="email" value="' + escapeHtml(lastEmail) + '" autofocus placeholder="you@cityofithaca.org" /><button class="primary" id="emailSubmit">Continue</button>' + (attempts >= 3 ? '<button id="supLink" style="margin-top:10px;width:100%;padding:14px;background:transparent;color:var(--red);font-weight:600">Email not recognized? Tell Fix This →</button>' : '') + '<div class="help"><strong>Demo logins</strong><div class="hints">admin@fixthis.local / city2024 (master)<br>roads@cityofithaca.org / roads2024<br>scl-facilities@cornell.edu / build2024<br>(see storage.js for full list)</div></div></div></div>');
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
        lastError = "That email isn't authorized." + (attempts >= 3 ? " Tap the link below to tell us why you should have access." : "");
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
      if (!emp) { lastError = "Wrong password."; render(); return; }
      setSession({ email: emp.email, scope: emp.scope, name: emp.name, role: emp.role });
      boot();
    }
    render();
  }

  function dashboard(session) {
    const isMaster = session.scope === "ALL";
    let q = "";
    who.innerHTML = '<strong>' + escapeHtml(session.name) + '</strong>' + escapeHtml(session.role) + ' · <a href="#" id="logout">sign out</a>';
    who.querySelector("#logout").addEventListener("click", e => { e.preventDefault(); clearSession(); window.location.reload(); });

    function getReports() {
      const all = window.STORAGE.list();
      return isMaster ? all : all.filter(r => r.dro === session.scope);
    }

    function renderMain() {
      const reports = getReports();
      const filtered = q ? reports.filter(r => (r.description + " " + (r.extra || "") + " " + r.id).toLowerCase().includes(q.toLowerCase())) : reports;
      const counts = { Open: 0, "In Progress": 0, Resolved: 0, urgent: 0 };
      for (const r of reports) { counts[r.status] = (counts[r.status] || 0) + 1; if (r.emergency) counts.urgent++; }

      root.innerHTML = '<div class="toolbar"><input id="searchInp" placeholder="Search ticket ID, description…" value="' + escapeHtml(q) + '" /><div class="stats"><div class="stat"><strong>' + counts.Open + '</strong>open</div><div class="stat"><strong>' + counts["In Progress"] + '</strong>in progress</div><div class="stat"><strong>' + counts.Resolved + '</strong>resolved</div>' + (counts.urgent ? '<div class="stat" style="background:#fee2e2;border-color:#fecaca"><strong style="color:#b91c1c">' + counts.urgent + '</strong>urgent</div>' : '') + '</div></div><div class="board">' + STATUSES.map(s => { const inThisCol = filtered.filter(r => (r.status || "Open") === s); return '<div class="col" data-status="' + s + '"><div class="col-head"><span>' + s + '</span><span class="count">' + inThisCol.length + '</span></div><div class="col-list" data-status="' + s + '">' + (inThisCol.length === 0 ? '<div class="col-empty">drop tickets here</div>' : inThisCol.map(receiptHtml).join("")) + '</div></div>'; }).join("") + '</div>';

      root.querySelector("#searchInp").addEventListener("input", e => { q = e.target.value; renderMain(); });
      wireDragDrop(); wireTapActions(); wireCopyButtons(); wirePhotoZoom();
    }

    function receiptHtml(r) {
      const dro = window.ROUTING.get(r.dro);
      const owner = r.owner || dro.owners[0];
      const mapsUrl = r.geo ? "https://www.google.com/maps?q=" + r.geo.lat + "," + r.geo.lon : null;
      const subject = "Fix This ticket " + r.id + " — " + dro.label;
      const body = "Ticket: " + r.id + "\nDepartment: " + dro.label + "\nStatus: " + (r.status || "Open") + "\n" + (mapsUrl ? "Location: " + mapsUrl + "\n" : "") + "\nReported: " + r.description + (r.extra ? "\n\nExtra: " + r.extra : "");
      const mailto = owner.email ? "mailto:" + owner.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body) : null;
      return '<article class="receipt" draggable="true" data-id="' + r.id + '"><div class="id"><span>' + escapeHtml(r.id) + '</span><span class="dept">' + dro.icon + ' ' + escapeHtml(dro.label.toUpperCase()) + '</span></div>' + (r.photo ? '<div class="photo" style="background-image:url(' + r.photo + ')" data-img="' + r.photo + '"></div>' : '<div class="photo empty">no photo</div>') + '<p class="desc">' + escapeHtml(r.description) + '</p>' + (r.extra ? '<p class="desc" style="font-size:12px;color:#555;font-weight:400">' + escapeHtml(r.extra) + '</p>' : '') + '<div class="meta-line"><span>' + fmtDate(r.createdAt) + '</span>' + (r.emergency ? '<span class="urgent">urgent</span>' : '') + '</div><div class="meta-line">' + (mapsUrl ? '<span>📍 <a href="' + mapsUrl + '" target="_blank" rel="noopener" style="color:#000">' + r.geo.lat.toFixed(4) + ', ' + r.geo.lon.toFixed(4) + '</a></span>' : '<span style="color:var(--warn)">📍 no location</span>') + '</div><div class="meta-line"><span>→ <strong>' + escapeHtml(owner.scope) + '</strong></span></div>' + (owner.email ? '<div class="actions-row"><a href="' + (mailto || '#') + '">Email</a><button class="ghost copy-email" data-email="' + escapeHtml(owner.email) + '">Copy</button></div>' : '') + '</article>';
    }

    function wireDragDrop() {
      let dragId = null;
      const cols = root.querySelectorAll(".col-list");
      root.querySelectorAll(".receipt").forEach(card => {
        card.addEventListener("dragstart", e => { dragId = card.dataset.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", card.dataset.id); } catch {} });
        card.addEventListener("dragend", () => { card.classList.remove("dragging"); cols.forEach(c => c.parentElement.classList.remove("drag-over")); dragId = null; });
      });
      cols.forEach(list => {
        const col = list.parentElement;
        list.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; col.classList.add("drag-over"); });
        list.addEventListener("dragleave", e => { if (!list.contains(e.relatedTarget)) col.classList.remove("drag-over"); });
        list.addEventListener("drop", e => { e.preventDefault(); col.classList.remove("drag-over"); const id = dragId || e.dataTransfer.getData("text/plain"); if (!id) return; const newStatus = list.dataset.status; const updated = window.STORAGE.update(id, { status: newStatus }); if (updated) { toast("Moved to " + newStatus); renderMain(); } });
      });
    }

    function wireTapActions() {
      root.querySelectorAll(".receipt").forEach(card => {
        card.addEventListener("click", e => {
          if (e.target.closest("a") || e.target.closest("button") || e.target.closest(".photo")) return;
          if (!matchMedia("(hover: none)").matches) return;
          openMoveSheet(card.dataset.id);
        });
      });
    }

    function wireCopyButtons() {
      root.querySelectorAll(".copy-email").forEach(b => {
        b.addEventListener("click", async e => {
          e.preventDefault(); e.stopPropagation();
          const email = b.dataset.email;
          const ok = await copyToClipboard(email);
          if (ok) { b.textContent = "✓ Copied"; toast(email + " copied"); setTimeout(() => { b.textContent = "Copy"; }, 1400); }
          else { window.prompt("Copy this email manually:", email); }
        });
      });
    }

    function wirePhotoZoom() {
      root.querySelectorAll(".photo[data-img]").forEach(p => {
        p.addEventListener("click", e => { e.stopPropagation(); const m = el('<div class="modal"><img src="' + p.dataset.img + '" /></div>'); m.addEventListener("click", () => m.remove()); document.body.appendChild(m); });
      });
    }

    function openMoveSheet(id) {
      const r = window.STORAGE.get(id);
      if (!r) return;
      const cur = r.status || "Open";
      const sheet = el('<div class="sheet-bg"><div class="sheet"><h3>Move ticket ' + escapeHtml(id) + '</h3><p style="margin:0 0 6px;color:var(--muted);font-size:12px">Currently: <strong>' + escapeHtml(cur) + '</strong></p>' + STATUSES.map(s => '<button class="opt' + (s === cur ? ' current' : '') + '" data-status="' + s + '"><span>' + s + '</span><span>' + (s === "Open" ? "🔴" : s === "In Progress" ? "🟡" : "🟢") + '</span></button>').join("") + '<div class="cancel">cancel</div></div></div>');
      function close() { sheet.remove(); }
      sheet.addEventListener("click", e => { if (e.target === sheet) close(); if (e.target.closest(".cancel")) close(); });
      sheet.querySelectorAll(".opt").forEach(b => { b.addEventListener("click", () => { const newStatus = b.dataset.status; if (newStatus !== cur) { window.STORAGE.update(id, { status: newStatus }); toast("Moved to " + newStatus); } close(); renderMain(); }); });
      document.body.appendChild(sheet);
    }

    renderMain();
    if (window.STORAGE.onChange) { window.STORAGE.onChange(function () { try { renderMain(); } catch (e) {} }); }
  }

  function boot() {
    const s = getSession();
    if (s) dashboard(s);
    else { who.innerHTML = ""; loginScreen(); }
  }
  boot();
})();
