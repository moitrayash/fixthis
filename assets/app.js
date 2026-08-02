/* Fix This — citizen flow controller. Plain DOM, ~10KB.
   Photo and location are REQUIRED (per Yash spec).
*/
(() => {
  const app = document.getElementById("app");
  const state = {
    photo: null, description: "", extra: "", extraFiles: [],
    geo: null, takenAt: null, started: 0, editingId: null, emergencyEscalated: null,
  };

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function render(node) { app.innerHTML = ""; app.appendChild(node); }
  function toast(msg, ms) {
    ms = ms || 2400;
    const n = el('<div class="toast">' + msg + '</div>');
    document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, ms);
  }

  // EXIF extractor — JPEG only. Returns { lat, lon, takenAt } (any field may be null).
  async function extractExif(file) {
    if (!file || !/jpe?g/i.test(file.type)) return null;
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const dv = new DataView(buf);
      if (dv.getUint16(0) !== 0xFFD8) return null;
      let off = 2;
      while (off < dv.byteLength - 4) {
        if (dv.getUint8(off) !== 0xFF) return null;
        const marker = dv.getUint8(off + 1);
        const size = dv.getUint16(off + 2);
        if (marker === 0xE1) {
          const exifOff = off + 4;
          if (dv.getUint32(exifOff) !== 0x45786966) return null;
          const tiff = exifOff + 6;
          const little = dv.getUint16(tiff) === 0x4949;
          const u16 = (o) => little ? dv.getUint16(o, true) : dv.getUint16(o);
          const u32 = (o) => little ? dv.getUint32(o, true) : dv.getUint32(o);
          const ascii = (entryOff, count) => {
            const base = count > 4 ? tiff + u32(entryOff + 8) : entryOff + 8;
            let s = "";
            for (let i = 0; i < count - 1; i++) s += String.fromCharCode(dv.getUint8(base + i));
            return s;
          };
          const parseExifDate = (s) => {
            if (!s || s.length < 19) return null;
            const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
            if (!m) return null;
            const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
            return isFinite(t) ? t : null;
          };
          const ifd0Off = tiff + u32(tiff + 4);
          const numEntries = u16(ifd0Off);
          let gpsOff = 0, exifIfdOff = 0, ifd0DateTime = null;
          for (let i = 0; i < numEntries; i++) {
            const e = ifd0Off + 2 + i * 12;
            const tag = u16(e);
            if (tag === 0x8825) gpsOff = tiff + u32(e + 8);
            else if (tag === 0x8769) exifIfdOff = tiff + u32(e + 8);
            else if (tag === 0x0132) ifd0DateTime = parseExifDate(ascii(e, u32(e + 4)));
          }
          let lat = null, lon = null;
          if (gpsOff) {
            const gpsCount = u16(gpsOff);
            const gps = {};
            for (let i = 0; i < gpsCount; i++) {
              const e = gpsOff + 2 + i * 12;
              const tag = u16(e);
              const count = u32(e + 4);
              const valOff = u32(e + 8);
              if (tag === 1 || tag === 3) {
                gps[tag === 1 ? "latRef" : "lonRef"] = String.fromCharCode(dv.getUint8(e + 8));
              } else if (tag === 2 || tag === 4) {
                const base = count > 1 ? tiff + valOff : e + 8;
                const r = [];
                for (let j = 0; j < 3; j++) {
                  const num = u32(base + j * 8);
                  const den = u32(base + j * 8 + 4) || 1;
                  r.push(num / den);
                }
                gps[tag === 2 ? "lat" : "lon"] = r[0] + r[1] / 60 + r[2] / 3600;
              }
            }
            if (gps.lat && gps.lon) {
              lat = gps.latRef === "S" ? -gps.lat : gps.lat;
              lon = gps.lonRef === "W" ? -gps.lon : gps.lon;
            }
          }
          let takenAt = null;
          if (exifIfdOff) {
            const exifCount = u16(exifIfdOff);
            let dtOrig = null, dtDigi = null;
            for (let i = 0; i < exifCount; i++) {
              const e = exifIfdOff + 2 + i * 12;
              const tag = u16(e);
              if (tag === 0x9003) dtOrig = parseExifDate(ascii(e, u32(e + 4)));
              else if (tag === 0x9004) dtDigi = parseExifDate(ascii(e, u32(e + 4)));
            }
            takenAt = dtOrig || dtDigi || null;
          }
          if (!takenAt) takenAt = ifd0DateTime;
          if (lat == null && lon == null && takenAt == null) return null;
          return { lat: lat, lon: lon, takenAt: takenAt };
        }
        off += 2 + size;
      }
    } catch (e) { return null; }
    return null;
  }
  const extractGPS = extractExif;

  function getBrowserGeo() {
    return new Promise(function (resolve) {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        function () { resolve(null); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  function landing() {
    const node = el(
      '<section class="screen landing">' +
        '<h1>Report broken stuff<br>in Ithaca.</h1>' +
        '<p style="font-weight:600;color:var(--ink);max-width:34ch">Potholes, Streetlights, Trash, Benches, Sidewalks, Buses</p>' +
        '<p>Snap a photo. One sentence. We send it to the city office that can actually fix it.</p>' +
        '<button class="big-red" id="startBtn">Report something</button>' +
        '<span class="pill">Free, No login, Ithaca + Cornell pilot</span>' +
        '<a href="pulse.html" class="live-strip" id="liveStrip"><span class="dot"></span><span><strong id="liveCount">—</strong> things being fixed in Ithaca</span><span class="arrow">→</span></a>' +
      '</section>'
    );
    if (window.STORAGE && window.STORAGE.onChange) {
      window.STORAGE.onChange(function (reports) {
        const elc = node.querySelector('#liveCount');
        if (!elc) return;
        const live = reports.filter(function (r) { return !r.trashed; });
        const total = live.length || 0;
        elc.textContent = total === 0 ? 'Be the first' : total;
        const span = elc.parentElement;
        if (total === 0 && span) span.innerHTML = '<strong>Be the first</strong> to fix something';
      });
    }
    node.querySelector("#startBtn").addEventListener("click", function () {
      state.started = Date.now();
      getBrowserGeo().then(function (g) {
        if (g && !state.geo) state.geo = Object.assign({}, g, { source: "browser" });
      });
      render(photoStep());
    });
    return node;
  }

  function photoStep() {
    const node = el(
      '<section class="screen">' +
        '<div class="stack">' +
          '<h2 class="step-title">Take a photo of it</h2>' +
          '<p class="step-sub">Required — a picture helps the right team show up with the right tools.</p>' +
          '<label class="photo-pick" for="photoFile" id="photoPickLabel">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>' +
            '<strong>Tap to take a photo</strong>' +
            '<small>or choose from your library</small>' +
          '</label>' +
          '<input id="photoFile" type="file" accept="image/*" capture="environment" />' +
          '<div id="preview" class="hide"></div>' +
          '<button class="btn btn-red" id="nextBtn" disabled>Next</button>' +
        '</div>' +
      '</section>'
    );
    const fileIn = node.querySelector("#photoFile");
    const preview = node.querySelector("#preview");
    const nextBtn = node.querySelector("#nextBtn");
    const pickLabel = node.querySelector("#photoPickLabel");

    fileIn.addEventListener("change", async function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const dataUrl = await new Promise(function (res) {
        const r = new FileReader();
        r.onload = function () { res(r.result); };
        r.readAsDataURL(f);
      });
      state.photo = { dataUrl: dataUrl, file: f, name: f.name, size: f.size, type: f.type };
      const exif = await extractExif(f);
      if (exif) {
        if (exif.lat != null && exif.lon != null) {
          state.geo = { lat: exif.lat, lon: exif.lon, source: "exif" };
        }
        if (exif.takenAt) state.takenAt = exif.takenAt;
      }
      if (!state.takenAt && f.lastModified) state.takenAt = f.lastModified;

      pickLabel.classList.add("hide");
      preview.classList.remove("hide");
      preview.innerHTML =
        '<div class="photo-preview">' +
          '<img src="' + dataUrl + '" alt="Reported issue" />' +
          '<button class="retake" id="retakeBtn">Retake</button>' +
        '</div>';
      preview.querySelector("#retakeBtn").addEventListener("click", function () {
        state.photo = null;
        state.takenAt = null;
        if (state.geo && state.geo.source === "exif") state.geo = null;
        fileIn.value = "";
        preview.classList.add("hide");
        pickLabel.classList.remove("hide");
        nextBtn.disabled = true;
      });
      nextBtn.disabled = false;
    });
    nextBtn.addEventListener("click", function () { render(describeStep()); });
    return node;
  }

  function describeStep() {
    const node = el(
      '<section class="screen">' +
        '<div class="stack">' +
          '<h2 class="step-title">What’s wrong?</h2>' +
          '<p class="step-sub">A short sentence is fine. We’ll handle the rest.</p>' +
          '<textarea id="desc" placeholder="Big pothole on College Ave near Dunbar’s…" autofocus></textarea>' +
          '<details class="more" id="more">' +
            '<summary>+ Add more details</summary>' +
            '<div class="body">' +
              '<label style="font-weight:600;font-size:14px;color:var(--muted)">Anything else useful (when, how bad, who’s affected)?</label>' +
              '<textarea id="extra" placeholder="Optional"></textarea>' +
              '<label style="font-weight:600;font-size:14px;color:var(--muted)">More photos or short video</label>' +
              '<label class="btn btn-ghost" for="extraFiles" style="font-size:16px;padding:14px">+ Attach more media</label>' +
              '<input id="extraFiles" type="file" accept="image/*,video/*" multiple />' +
              '<div id="extraList" style="font-size:13px;color:var(--muted)"></div>' +
            '</div>' +
          '</details>' +
          '<div id="locStatus" style="font-size:13px;color:var(--muted);text-align:center;padding:6px"></div>' +
          '<button class="btn btn-red" id="fixBtn" disabled>Fix it</button>' +
        '</div>' +
      '</section>'
    );
    const desc = node.querySelector("#desc");
    const extra = node.querySelector("#extra");
    const extraFiles = node.querySelector("#extraFiles");
    const extraList = node.querySelector("#extraList");
    const fixBtn = node.querySelector("#fixBtn");
    const locStatus = node.querySelector("#locStatus");

    desc.value = state.description || "";
    extra.value = state.extra || "";

    function refreshButton() {
      const hasDesc = (state.description || "").trim().length >= 3;
      const hasGeo = !!state.geo;
      fixBtn.disabled = !(hasDesc && hasGeo);
      if (!hasGeo) {
        locStatus.innerHTML = '📍 Need your location — <a href="#" id="askLoc" style="color:var(--red);font-weight:700">tap to allow</a>';
      } else {
        locStatus.innerHTML = '✓ Location captured, ' + state.geo.source;
        locStatus.style.color = "var(--ok)";
      }
      const askLoc = locStatus.querySelector("#askLoc");
      if (askLoc) askLoc.addEventListener("click", function (e) {
        e.preventDefault();
        locStatus.textContent = "Asking your browser…";
        getBrowserGeo().then(function (g) {
          if (g) {
            state.geo = Object.assign({}, g, { source: "browser" });
          } else {
            locStatus.innerHTML = "⚠️ Couldn’t get location. Check your browser settings and try again.";
            locStatus.style.color = "var(--warn)";
          }
          refreshButton();
        });
      });
    }
    refreshButton();

    desc.addEventListener("input", function () {
      state.description = desc.value;
      refreshButton();
    });
    extra.addEventListener("input", function () { state.extra = extra.value; });
    extraFiles.addEventListener("change", function () {
      state.extraFiles = Array.from(extraFiles.files || []);
      extraList.textContent = state.extraFiles.length ? state.extraFiles.length + " file(s) attached" : "";
    });

    fixBtn.addEventListener("click", function () {
      const emerg = window.CLASSIFIER.detectEmergency(state.description + " " + state.extra);
      if (emerg) showEmergency(emerg, doSubmit); else doSubmit();
    });

    if (!state.geo) {
      getBrowserGeo().then(function (g) {
        if (g && !state.geo) {
          state.geo = Object.assign({}, g, { source: "browser" });
          refreshButton();
        }
      });
    }
    return node;
  }

  function showEmergency(emerg, onAfter) {
    const num = emerg.info.number;
    const telDigits = num.replace(/[^0-9+]/g, "");
    const overlay = el(
      '<div class="emerg" role="alertdialog" aria-live="assertive">' +
        '<div class="pill" style="background:#fff;color:var(--red)">Possible emergency</div>' +
        '<h2>Is this an emergency?</h2>' +
        '<p>If someone is in danger, call <strong>' + num + '</strong> right now. We’ll keep your report on file either way.</p>' +
        '<div class="countdown" id="cd">7</div>' +
        '<a class="btn btn-call" href="tel:' + telDigits + '">Call ' + num + '</a>' +
        '<button class="btn btn-cancel" id="notEmerg">Not an emergency, keep going</button>' +
        '<small style="opacity:.85">' + emerg.info.label + ', ' + emerg.info.note + '</small>' +
      '</div>'
    );
    document.body.appendChild(overlay);
    let n = 7;
    const cd = overlay.querySelector("#cd");
    const tick = setInterval(function () {
      n -= 1;
      cd.textContent = n;
      if (n <= 0) {
        clearInterval(tick);
        state.emergencyEscalated = emerg.tier;
        overlay.remove();
        onAfter();
      }
    }, 1000);
    overlay.querySelector("#notEmerg").addEventListener("click", function () {
      clearInterval(tick); overlay.remove(); onAfter();
    });
  }

  async function doSubmit() {
    render(loadingScreen());
    const text = state.description + " " + state.extra;
    const cls = window.CLASSIFIER.classify(text);
    const dro = window.ROUTING.get(cls.key);
    const owner = window.ROUTING.pickOwner(cls.key, text);
    const isEdit = !!state.editingId;

    const stages = isEdit ? [
      [25, "Updating your report…"],
      [60, "Notifying " + owner.scope + "…"],
      [100, "Done!"]
    ] : [
      [10, "Checking the photo…"],
      [22, "Reading location…"],
      [38, "Scanning for emergencies…"],
      [55, "Identifying department…"],
      [72, "Routing to " + dro.label + "…"],
      [88, "Reaching " + owner.scope + "…"],
      [100, "Done!"]
    ];
    await runLoader(stages);

    let report;
    if (isEdit) {
      report = window.STORAGE.update(state.editingId, {
        description: state.description, extra: state.extra,
        dro: cls.key, droLabel: dro.label, owner: owner,
        classification: { confidence: cls.confidence, scores: cls.scores },
        emergency: state.emergencyEscalated || null,
      });
    } else {
      const id = window.STORAGE.generateId();
      report = {
        id: id, createdAt: Date.now(), status: "Open",
        dro: cls.key, droLabel: dro.label, owner: owner,
        classification: { confidence: cls.confidence, scores: cls.scores },
        description: state.description, extra: state.extra,
        photo: state.photo ? state.photo.dataUrl : null,
        photoMeta: state.photo ? { name: state.photo.name, size: state.photo.size, type: state.photo.type } : null,
        extraFilesCount: state.extraFiles.length,
        geo: state.geo || null,
        takenAt: state.takenAt || null,
        takenAtSource: state.takenAt ? (state.geo && state.geo.source === "exif" ? "exif" : "file-mtime") : null,
        emergency: state.emergencyEscalated || null,
        meta: window.STORAGE.captureMetadata(),
      };
      window.STORAGE.save(report);
      state.editingId = report.id;
    }
    render(successScreen(report, isEdit));
  }

  function loadingScreen() {
    return el(
      '<section class="screen loader-screen">' +
        '<h2 class="step-title" style="text-align:center">Routing…</h2>' +
        '<div class="loader-bar"><div class="fill" id="fill"></div></div>' +
        '<div class="loader-row"><span id="msg">Starting…</span><span class="pct" id="pct">0%</span></div>' +
      '</section>'
    );
  }

  function runLoader(stages) {
    return new Promise(function (resolve) {
      const fill = document.getElementById("fill");
      const msg = document.getElementById("msg");
      const pct = document.getElementById("pct");
      let i = 0;
      function step() {
        if (i >= stages.length) return resolve();
        const pair = stages[i++];
        const p = pair[0], t = pair[1];
        if (fill) fill.style.width = p + "%";
        if (pct) pct.textContent = p + "%";
        if (msg) msg.textContent = t;
        const delay = i === stages.length ? 220 : 280 + Math.random() * 220;
        setTimeout(step, delay);
      }
      step();
    });
  }

  function successScreen(report, isEdit) {
    const dro = window.ROUTING.get(report.dro);
    const owner = report.owner;
    const headline = isEdit
      ? 'Updated. <span class="dept">' + dro.label + '</span> has the latest.'
      : '<span class="dept">' + dro.label + '</span> is on it!';
    const ownerPhone = owner.phone ? ' (' + owner.phone + ')' : '';
    const takenStr = report.takenAt ? new Date(report.takenAt).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) : "";
    const node = el(
      '<section class="screen success">' +
        '<div class="check">✓</div>' +
        '<h2>' + headline + '</h2>' +
        '<p style="margin:0;color:var(--muted);max-width:36ch;line-height:1.5">You’ve done your part. You are the crowd behind crowdsourced change. Let us know if someone doesn’t fix it soon.</p>' +
        '<p style="margin:0;color:var(--muted);font-size:13px">Routed to <strong>' + owner.scope + '</strong>' + ownerPhone + '.</p>' +
        '<div class="ticket">Ticket ' + report.id + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">' +
          (report.emergency ? '<span class="pill" style="background:#fee2e2;color:#b91c1c">Marked urgent</span>' : '') +
          (report.geo ? '<span class="pill">Location captured, ' + report.geo.source + '</span>' : '') +
          (takenStr ? '<span class="pill">Photo taken, ' + takenStr + '</span>' : '') +
        '</div>' +
        '<div class="success-actions">' +
          '<button class="btn btn-ghost" id="editBtn">Edit or add more</button>' +
          '<button class="btn btn-red" id="anotherBtn">Fix another thing</button>' +
          '<button class="btn btn-ghost" id="exitBtn">I’m done</button>' +
        '</div>' +
      '</section>'
    );
    node.querySelector("#editBtn").addEventListener("click", function () { render(describeStep()); });
    node.querySelector("#anotherBtn").addEventListener("click", function () {
      state.photo = null; state.description = ""; state.extra = "";
      state.extraFiles = []; state.geo = null; state.takenAt = null;
      state.emergencyEscalated = null; state.editingId = null;
      render(photoStep());
      getBrowserGeo().then(function (g) {
        if (g && !state.geo) state.geo = Object.assign({}, g, { source: "browser" });
      });
    });
    node.querySelector("#exitBtn").addEventListener("click", function () { render(byeScreen()); });
    return node;
  }

  function byeScreen() {
    const node = el(
      '<section class="screen success" style="gap:18px">' +
        '<div class="check" style="background:var(--ink)">·</div>' +
        '<h2>Thanks.</h2>' +
        '<p style="color:var(--muted);max-width:30ch;text-align:center">You can close this tab. Your report is saved.</p>' +
        '<button class="btn btn-red" id="restart" style="max-width:420px">Report something else</button>' +
      '</section>'
    );
    node.querySelector("#restart").addEventListener("click", function () { render(landing()); });
    return node;
  }

  document.addEventListener("click", function (e) {
    const a = e.target.closest && e.target.closest("a[data-about]");
    if (a) {
      e.preventDefault();
      alert("Fix This is a civic reporting tool. Take a photo, describe the problem, and we route it to the office that can fix it. Pilot for Ithaca and Cornell.");
    }
  });

  render(landing());
})();
