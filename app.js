/* Core: schedule state, rendering, edit panel, settings, undo and saving. */
(() => {
  'use strict';

  const R = (window.R = {});
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const PALETTE = ['#3d6fd6', '#8357c9', '#2f9e6b', '#1797a6', '#db8a2a', '#c64d86', '#d2453f', '#64748b', '#a39c93', '#7a9a2e', '#b0662f', '#4f5bd5'];
  const LS_DRAFT = 'rounds-draft-v1';
  const LS_VIEW = 'rounds-view-v1';
  const DEFAULTS = {
    v: 1, title: 'סבב סטודנטים', subtitle: '', startDate: '', weeks: 2,
    days: [0, 1, 2, 3, 4], dayStart: 480, dayEnd: 960, snap: 15, hourPx: 64,
    types: [{ id: 'lecture', name: 'הרצאה', color: PALETTE[0] }], events: []
  };

  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  const board = $('#board');
  const panel = $('#panel');

  let S = null;
  const mode = { canEdit: false, view: 'grid', selected: null, ready: false };
  const undoStack = [];
  const redoStack = [];
  // The schedule lives in schedule.json in the site's GitHub repository. Anyone can read it through
  // the site; saving needs the editor's GitHub key, which is kept in that browser only.
  const CFG = Object.assign({ owner: '', repo: '', branch: 'main', path: 'schedule.json' }, window.ROTATION_CONFIG || {});
  (() => {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return;
    if (!CFG.owner) CFG.owner = m[1];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (!CFG.repo) CFG.repo = seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io';
  })();
  const LS_TOKEN = 'rotation-gh-key-v1';
  const Store = { token: '', sha: '', available: false, rev: 0, savedRev: 0, saving: false, timer: 0, retried: false };

  /* ---------- helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const parseTime = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => 'e' + Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function durLabel(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' דקות';
    const hs = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות';
    return m ? hs + ' ו־' + m + ' דקות' : hs;
  }

  function weekSunday() {
    const [y, m, d] = (S.startDate || isoDate(new Date())).split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1, 12);
    dt.setDate(dt.getDate() - dt.getDay());
    return dt;
  }
  function dateOf(week, day) { const d = weekSunday(); d.setDate(d.getDate() + week * 7 + day); return d; }
  const dm = (d) => pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
  const dmy = (d) => dm(d) + '.' + d.getFullYear();
  const visibleDays = () => [...S.days].sort((a, b) => a - b);
  const typeOf = (id) => S.types.find((t) => t.id === id) || S.types[0] || { id: '', name: '', color: '#888888' };
  const getEv = (id) => S.events.find((e) => e.id === id);
  const snapM = (m) => Math.round(m / S.snap) * S.snap;
  function rangeLabel() {
    const days = visibleDays();
    if (!days.length) return '';
    return dmy(dateOf(0, days[0])) + ' – ' + dmy(dateOf(S.weeks - 1, days[days.length - 1]));
  }
  function dayLabel(w, d) { return 'יום ' + DAY_NAMES[d] + ' ' + dm(dateOf(w, d)); }

  function normalize(raw) {
    const s = Object.assign({}, DEFAULTS, raw || {});
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate || '')) s.startDate = isoDate(new Date());
    s.types = Array.isArray(s.types) && s.types.length ? s.types : DEFAULTS.types.slice();
    s.events = Array.isArray(s.events) ? s.events.filter((e) => e && e.end > e.start) : [];
    s.days = Array.isArray(s.days) && s.days.length ? s.days : DEFAULTS.days.slice();
    s.weeks = clamp(+s.weeks || 2, 1, 8);
    s.snap = [5, 10, 15, 30].includes(+s.snap) ? +s.snap : 15;
    s.hourPx = clamp(+s.hourPx || 64, 40, 120);
    if (!(s.dayEnd > s.dayStart)) { s.dayStart = 480; s.dayEnd = 960; }
    return s;
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    t.append(span);
    if (actionLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.onclick = () => { t.hidden = true; action(); };
      t.append(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 6500 : 3200);
  }

  /* ---------- undo / commit ---------- */
  const snap = () => JSON.stringify(Object.assign({}, S, { savedAt: undefined }));
  function pushUndo() {
    undoStack.push(snap());
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }
  function commit(fn, opts = {}) {
    pushUndo();
    fn();
    changed(opts);
  }
  function changed(opts = {}) {
    markDirty();
    if (opts.render !== false) render();
  }
  function restore(json) {
    const savedAt = S.savedAt;
    S = normalize(JSON.parse(json));
    S.savedAt = savedAt;
    if (mode.selected && !getEv(mode.selected)) closePanel();
    changed();
    if (!$('#settings').open) return;
    fillSettings();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); updateUndoButtons(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); updateUndoButtons(); }
  function updateUndoButtons() { $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length; }

  // Text fields: one undo step per focus session, not per keystroke.
  let textSession = false;
  function beginText() { if (!textSession) { pushUndo(); textSession = true; } }
  document.addEventListener('focusout', () => { textSession = false; }, true);

  /* ---------- saving (GitHub) ---------- */
  const STATUS_TEXT = { saved: 'נשמר · האתר מתעדכן תוך כדקה', saving: 'שומר…', dirty: 'שינויים ממתינים לשמירה', error: 'השמירה נכשלה', offline: 'אין חיבור, אנסה שוב בעוד רגע', idle: '' };
  function setStatus(state) {
    const el = $('#saveStatus');
    el.dataset.state = state === 'offline' ? 'error' : state;
    el.textContent = STATUS_TEXT[state] || '';
    $('#btnSave').hidden = !(state === 'dirty' || state === 'error' || state === 'offline');
  }

  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  const repoPath = () => '/repos/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo);
  const filePath = () => repoPath() + '/contents/' + CFG.path.split('/').map(encodeURIComponent).join('/');

  async function gh(path, opts = {}) {
    let r;
    try {
      r = await fetch('https://api.github.com' + path, Object.assign({ cache: 'no-store' }, opts, {
        headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + Store.token, 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {})
      }));
    } catch (e) {
      const err = new Error('network');
      err.status = 0;
      throw err;
    }
    let body = null;
    try { body = await r.json(); } catch (e) { body = null; }
    if (!r.ok) {
      const err = new Error((body && body.message) || 'HTTP ' + r.status);
      err.status = r.status;
      throw err;
    }
    return body;
  }
  async function readFromGitHub() {
    const j = await gh(filePath() + '?ref=' + encodeURIComponent(CFG.branch));
    Store.sha = j.sha;
    return JSON.parse(b64decode(j.content));
  }
  async function readPublished() {
    try {
      const r = await fetch(CFG.path + '?v=' + Date.now(), { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }
  function putFile(content, message) {
    const body = { message, content, branch: CFG.branch };
    if (Store.sha) body.sha = Store.sha;
    return gh(filePath(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  function writeDraft() {
    try { localStorage.setItem(LS_DRAFT, JSON.stringify({ base: S.savedAt || '', data: JSON.parse(snap()) })); } catch (e) { /* storage unavailable */ }
  }
  function clearDraft() { try { localStorage.removeItem(LS_DRAFT); } catch (e) { /* ignore */ } }
  function markDirty() {
    Store.rev++;
    writeDraft();
    if (Store.available) { setStatus('dirty'); scheduleSave(4000); }
  }
  function scheduleSave(delay) {
    clearTimeout(Store.timer);
    Store.timer = setTimeout(saveNow, delay);
  }
  async function saveNow() {
    clearTimeout(Store.timer);
    if (!Store.available || Store.rev === Store.savedRev) return;
    if (Store.saving) { scheduleSave(1500); return; }
    Store.saving = true;
    setStatus('saving');
    const rev = Store.rev;
    const savedAt = new Date().toISOString();
    const content = b64encode(JSON.stringify(Object.assign(JSON.parse(snap()), { savedAt }), null, 1) + '\n');
    const message = 'עדכון הלוח ' + savedAt.slice(0, 16).replace('T', ' ');
    try {
      let res;
      try {
        res = await putFile(content, message);
      } catch (err) {
        if (err.status !== 409 && err.status !== 422) throw err;
        // Saved from another device in the meantime: like any save, this version replaces it.
        const cur = await gh(filePath() + '?ref=' + encodeURIComponent(CFG.branch));
        Store.sha = cur.sha;
        res = await putFile(content, message);
      }
      Store.sha = res.content.sha;
      S.savedAt = savedAt;
      Store.savedRev = rev;
      Store.retried = false;
      if (Store.rev === rev) { clearDraft(); setStatus('saved'); } else { writeDraft(); scheduleSave(1500); }
    } catch (err) {
      if (err.status === 401 || (err.status === 403 && !/rate limit/i.test(err.message))) {
        setStatus('error');
        openUnlock('המפתח הזה לא מאפשר לשמור. השינויים שמורים במכשיר הזה; היכנסו עם מפתח שיש לו Contents: Read and write.');
      } else if (err.status === 0) {
        setStatus('offline');
        scheduleSave(15000);
      } else if (!Store.retried) {
        Store.retried = true;
        setStatus('dirty');
        scheduleSave(5000 + Math.random() * 4000);
      } else {
        Store.retried = false;
        setStatus('error');
      }
    } finally {
      Store.saving = false;
    }
  }

  /* ---------- rendering ---------- */
  function layoutDay(evs) {
    const res = new Map();
    let cluster = [], cols = [], clusterEnd = -1;
    const flush = () => { const n = cols.length; cluster.forEach((o) => res.set(o.e.id, { col: o.col, n })); cluster = []; cols = []; clusterEnd = -1; };
    evs.slice().sort((a, b) => a.start - b.start || b.end - a.end).forEach((e) => {
      if (cluster.length && e.start >= clusterEnd) flush();
      let c = cols.findIndex((end) => end <= e.start);
      if (c === -1) { c = cols.length; cols.push(e.end); } else cols[c] = e.end;
      cluster.push({ e, col: c });
      clusterEnd = Math.max(clusterEnd, e.end);
    });
    flush();
    return res;
  }

  function evHTML(e, pos) {
    const t = typeOf(e.type);
    const vs = Math.max(e.start, S.dayStart), ve = Math.min(e.end, S.dayEnd);
    const top = ((vs - S.dayStart) / 60) * S.hourPx;
    const h = Math.max(((ve - vs) / 60) * S.hourPx, 14);
    const w = 100 / pos.n, l = pos.col * w;
    const cls = ['ev'];
    if (h < 44) cls.push('compact');
    if (mode.selected === e.id) cls.push('sel');
    const meta = [e.lecturer, e.location].filter(Boolean).map((x) => `<div class="ev-meta">${esc(x)}</div>`).join('');
    const notes = e.notes ? `<div class="ev-notes">${esc(e.notes)}</div>` : '';
    const time = fmt(e.start) + '–' + fmt(e.end);
    return `<div class="${cls.join(' ')}" data-id="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc((e.title || 'ללא נושא') + ', ' + time)}"
      style="--c:${esc(t.color)};top:${top}px;height:${h}px;inset-inline-start:calc(${l}% + 3px);width:calc(${w}% - 6px)">
      <div class="ev-h h-top" data-h="top"></div>
      <div class="ev-body"><div class="ev-time">${time}</div><div class="ev-title">${esc(e.title) || 'ללא נושא'}</div>${meta}${notes}</div>
      <div class="ev-h h-bot" data-h="bot"></div></div>`;
  }

  function weekHeadHTML(w) {
    const days = visibleDays();
    const range = days.length ? dm(dateOf(w, days[0])) + ' – ' + dm(dateOf(w, days[days.length - 1])) : '';
    const outside = S.events.filter((e) => e.week === w && S.days.includes(e.day) && (e.end <= S.dayStart || e.start >= S.dayEnd)).length;
    const warn = outside && mode.view === 'grid' ? ` <span class="outside">· ${outside} פעילויות מחוץ לשעות הלוח</span>` : '';
    return `<div class="week-head"><h2>שבוע ${w + 1}</h2><span>${range}${warn}</span></div>`;
  }

  function gridWeekHTML(w) {
    const days = visibleDays();
    const hours = (S.dayEnd - S.dayStart) / 60;
    const offset = (((60 - (S.dayStart % 60)) % 60) / 60) * S.hourPx;
    const today = isoDate(new Date());
    let h = `<section class="week" data-week="${w}">${weekHeadHTML(w)}<div class="grid-scroll"><div class="grid" style="--cols:${days.length};--hours:${hours};--hour:${S.hourPx}px;--offset:${offset}px">`;
    h += '<div class="corner"></div>';
    days.forEach((d) => {
      const dt = dateOf(w, d);
      h += `<div class="day-head${isoDate(dt) === today ? ' today' : ''}"><strong>יום ${DAY_NAMES[d]}</strong><span>${dm(dt)}</span></div>`;
    });
    h += '<div class="times">';
    for (let m = Math.ceil(S.dayStart / 60) * 60; m < S.dayEnd; m += 60) {
      const top = ((m - S.dayStart) / 60) * S.hourPx;
      h += `<div class="time-label${top === 0 ? ' at0' : ''}" style="top:${top}px">${fmt(m)}</div>`;
    }
    h += '</div>';
    days.forEach((d) => {
      const evs = S.events.filter((e) => e.week === w && e.day === d && e.end > S.dayStart && e.start < S.dayEnd);
      const pos = layoutDay(evs);
      h += `<div class="day-col" data-week="${w}" data-day="${d}">${evs.map((e) => evHTML(e, pos.get(e.id))).join('')}</div>`;
    });
    return h + '</div></div></section>';
  }

  function listWeekHTML(w) {
    const days = visibleDays();
    let h = `<section class="week" data-week="${w}">${weekHeadHTML(w)}<div class="agenda">`;
    days.forEach((d) => {
      const evs = S.events.filter((e) => e.week === w && e.day === d).sort((a, b) => a.start - b.start);
      h += `<div class="ag-day"><h3>יום ${DAY_NAMES[d]} <span>${dm(dateOf(w, d))}</span></h3>`;
      h += evs.length ? '<ul>' + evs.map((e) => {
        const sub = [e.lecturer, e.location].filter(Boolean).map(esc).join(' · ');
        return `<li class="ag-item" data-id="${esc(e.id)}" style="--c:${esc(typeOf(e.type).color)}"${mode.canEdit ? ' tabindex="0" role="button"' : ''}>
          <time>${fmt(e.start)}–${fmt(e.end)}</time>
          <div><b>${esc(e.title) || 'ללא נושא'}</b>${sub ? `<small>${sub}</small>` : ''}${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</div></li>`;
      }).join('') + '</ul>' : '<p class="ag-empty">אין פעילויות</p>';
      h += '</div>';
    });
    return h + '</div></section>';
  }

  function renderHeader() {
    $('#docTitle').textContent = S.title || 'סבב סטודנטים';
    $('#docSubtitle').textContent = S.subtitle || '';
    $('#docSubtitle').hidden = !S.subtitle;
    $('#docRange').textContent = rangeLabel() + ' · ' + (S.weeks === 1 ? 'שבוע אחד' : S.weeks === 2 ? 'שבועיים' : S.weeks + ' שבועות');
  }

  function renderLegend() {
    const used = new Set(S.events.map((e) => e.type));
    $('#legend').innerHTML = S.types.filter((t) => used.has(t.id) && t.name)
      .map((t) => `<span class="legend-item" style="--c:${esc(t.color)}"><i></i>${esc(t.name)}</span>`).join('');
  }

  function render() {
    if (!S) return;
    renderHeader();
    renderLegend();
    const weeks = Array.from({ length: S.weeks }, (_, w) => w);
    board.innerHTML = weeks.map(mode.view === 'grid' ? gridWeekHTML : listWeekHTML).join('');
    if (!panel.hidden) fillPanel();
  }

  // Cheap path while typing: re-render only the affected day column / agenda.
  function renderEvent(e) {
    renderLegend();
    if (mode.view !== 'grid') { render(); return; }
    const col = board.querySelector(`.day-col[data-week="${e.week}"][data-day="${e.day}"]`);
    if (!col) { render(); return; }
    const evs = S.events.filter((x) => x.week === e.week && x.day === e.day && x.end > S.dayStart && x.start < S.dayEnd);
    const pos = layoutDay(evs);
    col.innerHTML = evs.map((x) => evHTML(x, pos.get(x.id))).join('');
  }

  function selectEvent(id) {
    mode.selected = id;
    board.querySelectorAll('.ev.sel').forEach((el) => el.classList.remove('sel'));
    if (id) board.querySelectorAll(`.ev[data-id="${CSS.escape(id)}"]`).forEach((el) => el.classList.add('sel'));
  }

  /* ---------- edit panel ---------- */
  const F = {
    title: $('#fTitle'), lecturer: $('#fLecturer'), location: $('#fLocation'), notes: $('#fNotes'),
    types: $('#fTypes'), day: $('#fDay'), start: $('#fStart'), end: $('#fEnd'), duration: $('#fDuration')
  };

  function openPanel(id, focusTitle) {
    if (!mode.canEdit) return;
    selectEvent(id);
    panel.hidden = false;
    app.classList.add('panel-open');
    fillPanel();
    if (focusTitle) setTimeout(() => { F.title.focus(); F.title.select(); }, 30);
  }
  function closePanel() {
    panel.hidden = true;
    app.classList.remove('panel-open');
    selectEvent(null);
  }
  function fillPanel() {
    const e = getEv(mode.selected);
    if (!e) { closePanel(); return; }
    ['title', 'lecturer', 'location', 'notes'].forEach((k) => { if (document.activeElement !== F[k]) F[k].value = e[k] || ''; });
    F.types.innerHTML = S.types.map((t) => `<button type="button" class="chip-btn" role="radio" aria-checked="${t.id === e.type}" data-type="${esc(t.id)}" style="--c:${esc(t.color)}"><i></i>${esc(t.name || 'ללא שם')}</button>`).join('');
    let opts = '';
    for (let w = 0; w < S.weeks; w++) visibleDays().forEach((d) => { opts += `<option value="${w}:${d}">שבוע ${w + 1} · ${dayLabel(w, d)}</option>`; });
    if (e.week >= S.weeks || !S.days.includes(e.day)) opts += `<option value="${e.week}:${e.day}">שבוע ${e.week + 1} · ${dayLabel(e.week, e.day)} (מוסתר)</option>`;
    F.day.innerHTML = opts;
    F.day.value = e.week + ':' + e.day;
    if (document.activeElement !== F.start) F.start.value = fmt(e.start);
    if (document.activeElement !== F.end) F.end.value = fmt(e.end);
    F.duration.textContent = 'משך: ' + durLabel(e.end - e.start);
  }

  ['title', 'lecturer', 'location', 'notes'].forEach((k) => {
    F[k].addEventListener('input', () => {
      const e = getEv(mode.selected);
      if (!e) return;
      beginText();
      e[k] = F[k].value;
      markDirty();
      renderEvent(e);
    });
  });
  F.types.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-type]');
    const e = getEv(mode.selected);
    if (!b || !e || e.type === b.dataset.type) return;
    commit(() => { e.type = b.dataset.type; });
  });
  F.day.addEventListener('change', () => {
    const e = getEv(mode.selected);
    if (!e) return;
    const [w, d] = F.day.value.split(':').map(Number);
    commit(() => { e.week = w; e.day = d; });
  });
  F.start.addEventListener('change', () => {
    const e = getEv(mode.selected), v = parseTime(F.start.value);
    if (!e || v == null) return;
    commit(() => { const dur = e.end - e.start; e.start = v; if (e.end <= v) e.end = Math.min(v + dur, 24 * 60); });
  });
  F.end.addEventListener('change', () => {
    const e = getEv(mode.selected), v = parseTime(F.end.value);
    if (!e) return;
    if (v == null || v <= e.start) { F.end.value = fmt(e.end); toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה'); return; }
    commit(() => { e.end = v; });
  });
  $('#evForm').addEventListener('submit', (ev) => ev.preventDefault());
  $('#panelClose').addEventListener('click', closePanel);
  $('#btnDel').addEventListener('click', () => deleteSelected());
  $('#btnDup').addEventListener('click', () => duplicateSelected());

  function nextSlot(w, d) {
    const days = visibleDays();
    const i = days.indexOf(d);
    if (i >= 0 && i < days.length - 1) return [w, days[i + 1]];
    if (w < S.weeks - 1 && days.length) return [w + 1, days[0]];
    return [w, d];
  }
  function duplicateSelected() {
    const e = getEv(mode.selected);
    if (!e) return;
    const [w, d] = nextSlot(e.week, e.day);
    const copy = Object.assign({}, e, { id: uid(), week: w, day: d });
    commit(() => { S.events.push(copy); });
    openPanel(copy.id);
    toast('שוכפל ל' + dayLabel(w, d));
  }
  function deleteSelected() {
    const e = getEv(mode.selected);
    if (!e) return;
    commit(() => { S.events = S.events.filter((x) => x.id !== e.id); });
    closePanel();
    toast('"' + (e.title || 'פעילות') + '" נמחקה', 'ביטול', undo);
  }
  function addEvent(w, d, start, end, focus = true) {
    const used = S.types.find((t) => t.id === 'lecture') || S.types[0];
    const e = { id: uid(), week: w, day: d, start, end, title: '', lecturer: '', location: '', notes: '', type: used ? used.id : '' };
    commit(() => { S.events.push(e); });
    openPanel(e.id, focus);
    return e;
  }

  /* ---------- settings ---------- */
  const settings = $('#settings');
  const SF = {
    title: $('#sTitle'), subtitle: $('#sSubtitle'), start: $('#sStart'), weeks: $('#sWeeks'), days: $('#sDays'),
    dayStart: $('#sDayStart'), dayEnd: $('#sDayEnd'), snap: $('#sSnap'), hour: $('#sHour'), types: $('#sTypes')
  };
  function fillSettings() {
    if (document.activeElement !== SF.title) SF.title.value = S.title || '';
    if (document.activeElement !== SF.subtitle) SF.subtitle.value = S.subtitle || '';
    SF.start.value = S.startDate;
    SF.weeks.value = S.weeks;
    SF.days.innerHTML = DAY_NAMES.map((n, i) => `<label><input type="checkbox" value="${i}" ${S.days.includes(i) ? 'checked' : ''}>${n}</label>`).join('');
    SF.dayStart.value = fmt(S.dayStart);
    SF.dayEnd.value = fmt(S.dayEnd);
    SF.snap.value = String(S.snap);
    SF.hour.value = S.hourPx;
    fillTypes();
  }
  function fillTypes() {
    const counts = {};
    S.events.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.tname;
    SF.types.innerHTML = S.types.map((t) => `<div class="type-row" data-id="${esc(t.id)}">
      <input type="color" value="${esc(t.color)}" data-tcolor="${esc(t.id)}" aria-label="צבע עבור ${esc(t.name)}">
      <input type="text" value="${esc(t.name)}" data-tname="${esc(t.id)}" aria-label="שם הסוג">
      <span class="count">${counts[t.id] || 0}</span>
      <button type="button" class="btn icon ghost" data-tdel="${esc(t.id)}" ${counts[t.id] ? 'disabled title="בשימוש. העבירו קודם את הפעילויות לסוג אחר."' : 'title="מחיקה"'} aria-label="מחיקת סוג">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/></svg></button></div>`).join('');
    if (focused) { const el = SF.types.querySelector(`[data-tname="${CSS.escape(focused)}"]`); if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } }
  }
  $('#btnSettings').addEventListener('click', () => { fillSettings(); settings.showModal(); });

  SF.title.addEventListener('input', () => { beginText(); S.title = SF.title.value; markDirty(); renderHeader(); });
  SF.subtitle.addEventListener('input', () => { beginText(); S.subtitle = SF.subtitle.value; markDirty(); renderHeader(); });
  SF.start.addEventListener('change', () => { if (SF.start.value) commit(() => { S.startDate = SF.start.value; }); });
  SF.weeks.addEventListener('change', () => {
    const v = clamp(Math.round(+SF.weeks.value) || 1, 1, 8);
    SF.weeks.value = v;
    if (v !== S.weeks) commit(() => { S.weeks = v; });
  });
  SF.days.addEventListener('change', () => {
    const picked = [...SF.days.querySelectorAll('input:checked')].map((i) => +i.value);
    if (!picked.length) { fillSettings(); toast('צריך להשאיר לפחות יום אחד'); return; }
    commit(() => { S.days = picked; });
  });
  function setRange() {
    const a = parseTime(SF.dayStart.value), b = parseTime(SF.dayEnd.value);
    if (a == null || b == null || b - a < 60) { SF.dayStart.value = fmt(S.dayStart); SF.dayEnd.value = fmt(S.dayEnd); toast('טווח השעות צריך להיות לפחות שעה'); return; }
    commit(() => { S.dayStart = a; S.dayEnd = b; });
  }
  SF.dayStart.addEventListener('change', setRange);
  SF.dayEnd.addEventListener('change', setRange);
  SF.snap.addEventListener('change', () => commit(() => { S.snap = +SF.snap.value; }, { render: false }));
  SF.hour.addEventListener('input', () => { S.hourPx = +SF.hour.value; markDirty(); render(); });

  SF.types.addEventListener('input', (ev) => {
    const id = ev.target.dataset.tcolor || ev.target.dataset.tname;
    const t = id && S.types.find((x) => x.id === id);
    if (!t) return;
    beginText();
    if (ev.target.dataset.tcolor) t.color = ev.target.value; else t.name = ev.target.value;
    markDirty();
    render();
  });
  SF.types.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tdel]');
    if (!b || b.disabled) return;
    commit(() => { S.types = S.types.filter((t) => t.id !== b.dataset.tdel); });
    fillTypes();
  });
  $('#sAddType').addEventListener('click', () => {
    const usedColors = new Set(S.types.map((t) => t.color.toLowerCase()));
    const color = PALETTE.find((c) => !usedColors.has(c)) || PALETTE[S.types.length % PALETTE.length];
    const t = { id: 't' + Math.random().toString(36).slice(2, 7), name: 'סוג חדש', color };
    commit(() => { S.types.push(t); });
    fillTypes();
    const el = SF.types.querySelector(`[data-tname="${t.id}"]`);
    if (el) { el.focus(); el.select(); }
  });
  $('#settingsForm').addEventListener('submit', () => { /* method=dialog closes it */ });

  /* ---------- header controls ---------- */
  function setView(v) {
    mode.view = v;
    $('#viewGrid').setAttribute('aria-pressed', String(v === 'grid'));
    $('#viewList').setAttribute('aria-pressed', String(v === 'list'));
    try { localStorage.setItem(LS_VIEW, v); } catch (e) { /* ignore */ }
    render();
  }
  $('#viewGrid').addEventListener('click', () => setView('grid'));
  $('#viewList').addEventListener('click', () => setView('list'));
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnSave').addEventListener('click', () => saveNow(true));
  $('#btnAdd').addEventListener('click', () => {
    const days = visibleDays();
    const sel = getEv(mode.selected);
    const w = sel ? sel.week : 0, d = sel ? sel.day : days[0];
    const dayEvs = S.events.filter((e) => e.week === w && e.day === d);
    let start = snapM(Math.max(S.dayStart, dayEvs.reduce((m, e) => Math.max(m, e.end), S.dayStart)));
    if (start + 60 > S.dayEnd) start = S.dayStart;
    if (mode.view !== 'grid') setView('grid');
    addEvent(w, d, start, Math.min(start + 60, S.dayEnd));
  });
  const shareBtn = $('#btnShare'), shareMenu = $('#shareMenu');
  shareBtn.addEventListener('click', () => { shareMenu.hidden = !shareMenu.hidden; shareBtn.setAttribute('aria-expanded', String(!shareMenu.hidden)); });
  document.addEventListener('click', (ev) => {
    if (!shareMenu.hidden && !ev.target.closest('.menu-wrap')) { shareMenu.hidden = true; shareBtn.setAttribute('aria-expanded', 'false'); }
  });

  /* ---------- editor sign-in ---------- */
  const unlockDlg = $('#unlockDlg');
  function openUnlock(msg) {
    const err = $('#unlockErr');
    err.hidden = !msg;
    err.textContent = msg || '';
    $('#howtoRepo').textContent = CFG.repo || 'rotation';
    if (!unlockDlg.open) unlockDlg.showModal();
    setTimeout(() => $('#unlockKey').focus(), 30);
  }
  async function signIn(key) {
    Store.token = key;
    const repo = await gh(repoPath()); // 401: bad key; 404: the key cannot see this repository
    if (!repo.permissions || !repo.permissions.push) {
      const e = new Error('read-only');
      e.status = 403;
      throw e;
    }
    return readFromGitHub();
  }
  $('#btnUnlock').addEventListener('click', () => openUnlock());
  $('#unlockClose').addEventListener('click', () => unlockDlg.close());
  $('#unlockForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const key = $('#unlockKey').value.trim();
    if (!key) { openUnlock('הדביקו את מפתח העריכה'); return; }
    const go = $('#unlockGo');
    go.disabled = true;
    go.textContent = 'בודק…';
    try {
      const data = await signIn(key);
      try { localStorage.setItem(LS_TOKEN, key); } catch (e) { /* the key lasts for this visit only */ }
      $('#unlockKey').value = '';
      unlockDlg.close();
      S = normalize(data);
      Store.available = true;
      restoreDraft();
      setCanEdit(true);
      toast('העריכה פתוחה במכשיר הזה');
    } catch (err) {
      Store.token = '';
      openUnlock(err.status === 401 ? 'המפתח לא תקין או שפג תוקפו.'
        : err.status === 404 ? 'המפתח לא נותן גישה למאגר ' + CFG.repo + '. בחרו אותו תחת Repository access.'
        : err.status === 403 ? 'למפתח הזה אין הרשאת כתיבה. הגדירו Contents: Read and write.'
        : 'לא הצלחתי להתחבר ל־GitHub. בדקו את החיבור ונסו שוב.');
    } finally {
      go.disabled = false;
      go.textContent = 'כניסה';
    }
  });
  $('#sLock').addEventListener('click', () => {
    try { localStorage.removeItem(LS_TOKEN); } catch (e) { /* ignore */ }
    Store.token = '';
    Store.available = false;
    $('#settings').close();
    setCanEdit(false);
    toast('העריכה ננעלה במכשיר הזה');
  });

  // Unsaved edits made on top of exactly this saved version come back after a reload.
  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(LS_DRAFT) || 'null');
      if (draft && draft.data && draft.base === (S.savedAt || '') && JSON.stringify(draft.data) !== snap()) {
        const saved = snap();
        S = normalize(draft.data);
        S.savedAt = draft.base;
        undoStack.push(saved);
        Store.rev++;
        updateUndoButtons();
        setTimeout(() => toast('שוחזרו שינויים שעוד לא נשמרו', 'ביטול', () => { undo(); clearDraft(); }), 400);
      } else if (draft) clearDraft();
    } catch (e) { /* ignore */ }
  }

  /* ---------- boot ---------- */
  function setCanEdit(v) {
    mode.canEdit = v;
    app.classList.toggle('can-edit', v);
    if (!v) closePanel();
    const pending = Store.rev !== Store.savedRev;
    setStatus(v ? (pending ? 'dirty' : 'saved') : 'idle');
    if (v && pending) scheduleSave(2000);
    if (!v) $('#saveStatus').textContent = '';
    render();
  }

  async function boot() {
    try { const v = localStorage.getItem(LS_VIEW); mode.view = v === 'list' || v === 'grid' ? v : (innerWidth < 640 ? 'list' : 'grid'); } catch (e) { mode.view = innerWidth < 640 ? 'list' : 'grid'; }
    $('#viewGrid').setAttribute('aria-pressed', String(mode.view === 'grid'));
    $('#viewList').setAttribute('aria-pressed', String(mode.view === 'list'));
    app.classList.toggle('can-unlock', !!(CFG.owner && CFG.repo));

    let key = '';
    try { key = localStorage.getItem(LS_TOKEN) || ''; } catch (e) { key = ''; }
    let data = null;
    let editor = false;
    if (key && CFG.owner && CFG.repo) {
      try {
        data = await signIn(key);
        editor = true;
      } catch (err) {
        Store.token = '';
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          try { localStorage.removeItem(LS_TOKEN); } catch (e) { /* ignore */ }
          setTimeout(() => toast('מפתח העריכה כבר לא תקף. היכנסו מחדש כדי לערוך.', 'כניסה', () => openUnlock()), 600);
        } else {
          setTimeout(() => toast('אין חיבור ל־GitHub, הלוח מוצג לקריאה בלבד'), 600);
        }
      }
    }
    if (!data) data = await readPublished();
    S = normalize(data);
    if (editor) { Store.available = true; restoreDraft(); }
    if (!data) toast('לא הצלחתי לטעון את הלוח. רעננו את הדף.');
    mode.ready = true;
    updateUndoButtons();
    setCanEdit(editor);
  }

  Object.defineProperty(R, 'S', { get: () => S }); // live view; Object.assign would freeze today's value
  Object.assign(R, {
    mode, Store, DAY_NAMES, PALETTE,
    fmt, parseTime, clamp, uid, esc, snapM, dateOf, dm, dmy, dayLabel, durLabel, visibleDays, typeOf, getEv, rangeLabel,
    render, renderEvent, layoutDay, commit, pushUndo, changed, markDirty, undo, redo, saveNow,
    openPanel, closePanel, fillPanel, selectEvent, duplicateSelected, deleteSelected, addEvent, toast, setView
  });

  boot();
})();
