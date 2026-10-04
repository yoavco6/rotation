/* Direct manipulation: drag to move, drag edges to resize, drag or double-click to create, keyboard shortcuts. */
(() => {
  'use strict';
  const R = window.R;
  const board = document.getElementById('board');
  const THRESH = 4;
  let drag = null;

  const S = () => R.S;
  const pxPerMin = () => S().hourPx / 60;

  function colAt(x, y) {
    for (const c of board.querySelectorAll('.day-col')) {
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 24 && y <= r.bottom + 24) return c;
    }
    return null;
  }
  function minutesAt(col, y) {
    return S().dayStart + (y - col.getBoundingClientRect().top) / pxPerMin();
  }
  function place(el, start, end) {
    const s = S();
    el.style.top = (start - s.dayStart) * pxPerMin() + 'px';
    el.style.height = Math.max((end - start) * pxPerMin(), 14) + 'px';
    const t = el.querySelector('.ev-time');
    if (t) t.textContent = R.fmt(start) + '–' + R.fmt(end);
    else el.textContent = R.fmt(start) + '–' + R.fmt(end);
  }
  function autoScroll(y) {
    if (y < 56) window.scrollBy(0, -14);
    else if (y > innerHeight - 56) window.scrollBy(0, 14);
  }

  board.addEventListener('pointerdown', (ev) => {
    if (!R.mode.canEdit || R.mode.view !== 'grid' || ev.button !== 0) return;
    const evEl = ev.target.closest('.ev');
    const col = ev.target.closest('.day-col');
    if (!col) return;
    if (evEl) {
      const e = R.getEv(evEl.dataset.id);
      if (!e) return;
      const h = ev.target.closest('.ev-h');
      drag = {
        kind: h ? (h.dataset.h === 'top' ? 'top' : 'bot') : 'move',
        id: e.id, el: evEl, col, x: ev.clientX, y: ev.clientY, started: false, copy: ev.altKey && !h,
        orig: { week: e.week, day: e.day, start: e.start, end: e.end },
        grab: minutesAt(col, ev.clientY) - e.start
      };
      drag.next = Object.assign({}, drag.orig);
      ev.preventDefault();
    } else {
      if (ev.pointerType === 'touch') return; // let touch scroll; use the add button or double-tap
      const m = Math.floor(minutesAt(col, ev.clientY) / S().snap) * S().snap;
      drag = { kind: 'create', col, x: ev.clientX, y: ev.clientY, started: false, anchor: m, next: null };
      ev.preventDefault(); // no text selection while sweeping out a new block
    }
    try { board.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  });

  board.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < THRESH) return;
      drag.started = true;
      if (drag.kind === 'create') {
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'ev-ghost';
        drag.col.append(drag.ghost);
      } else {
        if (drag.copy) {
          const clone = drag.el.cloneNode(true);
          clone.classList.remove('sel');
          drag.el.after(clone);
          drag.el = clone;
          clone.classList.add('copying');
        }
        drag.el.classList.add('dragging');
        if (drag.kind === 'move') { drag.el.style.insetInlineStart = '3px'; drag.el.style.width = 'calc(100% - 6px)'; }
      }
    }
    const s = S(), o = drag.orig;
    autoScroll(ev.clientY);
    if (drag.kind === 'move') {
      const col = colAt(ev.clientX, ev.clientY) || drag.col;
      if (col !== drag.col) { col.append(drag.el); drag.col = col; }
      const dur = o.end - o.start;
      const maxStart = Math.max(s.dayStart, s.dayEnd - dur);
      const start = R.clamp(R.snapM(minutesAt(col, ev.clientY) - drag.grab), s.dayStart, maxStart);
      drag.next = { week: +col.dataset.week, day: +col.dataset.day, start, end: start + dur };
      place(drag.el, start, start + dur);
    } else if (drag.kind === 'top') {
      const start = R.clamp(R.snapM(minutesAt(drag.col, ev.clientY)), Math.min(s.dayStart, o.start), o.end - s.snap);
      drag.next = Object.assign({}, o, { start });
      place(drag.el, start, o.end);
    } else if (drag.kind === 'bot') {
      const end = R.clamp(R.snapM(minutesAt(drag.col, ev.clientY)), o.start + s.snap, Math.max(s.dayEnd, o.end));
      drag.next = Object.assign({}, o, { end });
      place(drag.el, o.start, end);
    } else if (drag.kind === 'create') {
      const m = R.clamp(R.snapM(minutesAt(drag.col, ev.clientY)), s.dayStart, s.dayEnd);
      let start = Math.min(drag.anchor, m), end = Math.max(drag.anchor, m);
      start = R.clamp(start, s.dayStart, s.dayEnd - s.snap);
      if (end - start < s.snap) end = start + s.snap;
      drag.next = { week: +drag.col.dataset.week, day: +drag.col.dataset.day, start, end };
      place(drag.ghost, start, end);
    }
  });

  function finish(ev, cancelled) {
    const d = drag;
    drag = null;
    if (!d) return;
    try { board.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    if (cancelled) { R.render(); return; }
    if (!d.started) {
      if (d.kind === 'create') { if (!document.getElementById('panel').hidden) R.closePanel(); }
      else R.openPanel(d.id);
      return;
    }
    const n = d.next, o = d.orig;
    if (d.kind === 'create') { if (d.ghost) d.ghost.remove(); R.addEvent(n.week, n.day, n.start, n.end); return; }
    const same = n.week === o.week && n.day === o.day && n.start === o.start && n.end === o.end;
    if (d.copy) {
      const src = R.getEv(d.id);
      const copy = Object.assign({}, src, n, { id: R.uid() });
      R.commit(() => { R.S.events.push(copy); });
      R.toast('הועתק ל' + R.dayLabel(n.week, n.day) + ', ' + R.fmt(n.start) + '–' + R.fmt(n.end));
    } else if (!same) {
      R.commit(() => { Object.assign(R.getEv(d.id), n); });
    } else {
      R.render();
    }
  }
  board.addEventListener('pointerup', (ev) => finish(ev, false));
  board.addEventListener('pointercancel', (ev) => finish(ev, true));
  board.addEventListener('lostpointercapture', (ev) => { if (drag && drag.started) finish(ev, false); });

  board.addEventListener('dblclick', (ev) => {
    if (!R.mode.canEdit || ev.target.closest('.ev')) return;
    const col = ev.target.closest('.day-col');
    if (!col) return;
    const s = S();
    const start = R.clamp(Math.floor(minutesAt(col, ev.clientY) / s.snap) * s.snap, s.dayStart, s.dayEnd - s.snap);
    R.addEvent(+col.dataset.week, +col.dataset.day, start, Math.min(start + 60, s.dayEnd));
  });

  // List view: tap a row to edit it.
  board.addEventListener('click', (ev) => {
    const item = ev.target.closest('.ag-item');
    if (item && R.mode.canEdit) R.openPanel(item.dataset.id);
  });

  /* ---------- keyboard ---------- */
  function nudge(e, key, shift) {
    const s = S(), step = s.snap;
    const days = R.visibleDays();
    R.commit(() => {
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const dir = key === 'ArrowUp' ? -1 : 1;
        if (shift) e.end = R.clamp(e.end + dir * step, e.start + step, 24 * 60);
        else { const dur = e.end - e.start; e.start = R.clamp(e.start + dir * step, 0, 24 * 60 - dur); e.end = e.start + dur; }
      } else {
        // RTL: the next day sits to the left.
        const dir = key === 'ArrowLeft' ? 1 : -1;
        const slots = [];
        for (let w = 0; w < s.weeks; w++) days.forEach((d) => slots.push([w, d]));
        const i = slots.findIndex(([w, d]) => w === e.week && d === e.day);
        const j = R.clamp(i + dir, 0, slots.length - 1);
        if (i >= 0) [e.week, e.day] = slots[j];
      }
    });
    const el = board.querySelector(`.ev[data-id="${CSS.escape(e.id)}"]`);
    if (el) el.focus();
  }

  document.addEventListener('keydown', (ev) => {
    const mod = ev.ctrlKey || ev.metaKey;
    const t = ev.target;
    const typing = t && (t.matches('input, textarea, select') || t.isContentEditable);
    if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); R.saveNow(true); return; }
    if (ev.key === 'Escape') {
      const menu = document.getElementById('shareMenu');
      if (!menu.hidden) { menu.hidden = true; return; }
      if (!document.getElementById('panel').hidden && !document.getElementById('settings').open) { R.closePanel(); return; }
    }
    if (!R.mode.canEdit || typing) return;
    if (mod && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); R.undo(); return; }
    if (mod && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); R.redo(); return; }
    const focusedEv = t && t.closest && t.closest('.ev');
    const id = (focusedEv && focusedEv.dataset.id) || R.mode.selected;
    const e = id && R.getEv(id);
    if (!e) return;
    if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); R.mode.selected = e.id; R.duplicateSelected(); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); R.mode.selected = e.id; R.deleteSelected(); return; }
    if (ev.key === 'Enter' && focusedEv) { ev.preventDefault(); R.openPanel(e.id); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key) && (focusedEv || !document.getElementById('panel').hidden)) {
      ev.preventDefault();
      nudge(e, ev.key, ev.shiftKey);
    }
  });
})();
