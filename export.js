/* Export: PNG image (all weeks), PDF (one A4 landscape page per week), plain text for messaging apps. */
(() => {
  'use strict';
  const R = window.R;
  const W = 1600, H = 1131, PAD = 48, TIME_W = 70, HEAD_H = 176, DAYHEAD_H = 44;
  const INK = '#15222a', INK2 = '#4c5d67', INK3 = '#7a8a93', LINE = '#d5dfe2', LINE_SOFT = '#e8eef0', ACCENT = '#0f6a70';
  const UI = '"IBM Plex Sans Hebrew", "Segoe UI", Arial, sans-serif';
  const DISPLAY = '"Frank Ruhl Libre", "David", "Times New Roman", serif';
  const MONO = '"IBM Plex Mono", Consolas, monospace';

  function rgb(hex) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const tint = (hex, a) => 'rgb(' + rgb(hex).map((c) => Math.round(c * a + 255 * (1 - a))).join(',') + ')';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawWeek(ctx, w, oy) {
    const S = R.S, days = R.visibleDays();
    const hours = (S.dayEnd - S.dayStart) / 60;
    const gridTop = oy + HEAD_H + DAYHEAD_H;
    const gridH = H - HEAD_H - DAYHEAD_H - PAD;
    const hourH = gridH / hours;
    const colW = (W - PAD * 2 - TIME_W) / Math.max(days.length, 1);
    const right = W - PAD;
    const yOf = (m) => gridTop + ((m - S.dayStart) / 60) * hourH;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, oy, W, H);
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    // Title block
    ctx.fillStyle = ACCENT;
    ctx.font = '500 15px ' + MONO;
    ctx.fillText(R.rangeLabel(), right, oy + PAD + 4);
    ctx.fillStyle = INK;
    ctx.font = '700 34px ' + DISPLAY;
    ctx.fillText(S.title || 'סבב סטודנטים', right, oy + PAD + 44);
    ctx.fillStyle = INK2;
    ctx.font = '400 17px ' + UI;
    if (S.subtitle) ctx.fillText(S.subtitle, right, oy + PAD + 72);
    // Week label, left side
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = '700 26px ' + DISPLAY;
    const weekLabel = 'שבוע ' + (w + 1);
    ctx.fillText(weekLabel, PAD, oy + PAD + 44);
    ctx.textAlign = 'right';

    // Legend
    const used = new Set(S.events.filter((e) => e.week === w).map((e) => e.type));
    let lx = right;
    ctx.font = '400 14px ' + UI;
    S.types.filter((t) => used.has(t.id) && t.name).forEach((t) => {
      const tw = ctx.measureText(t.name).width;
      if (lx - tw - 30 < PAD) return;
      ctx.fillStyle = t.color;
      roundRect(ctx, lx - 13, oy + PAD + 96, 13, 13, 3);
      ctx.fill();
      ctx.fillStyle = INK2;
      ctx.fillText(t.name, lx - 20, oy + PAD + 107);
      lx -= tw + 44;
    });
    ctx.fillStyle = INK;
    ctx.fillRect(PAD, oy + HEAD_H - 14, W - PAD * 2, 2);

    // Day headers + columns
    days.forEach((d, i) => {
      const x1 = right - TIME_W - i * colW;
      ctx.fillStyle = INK;
      ctx.font = '600 16px ' + UI;
      ctx.fillText('יום ' + R.DAY_NAMES[d], x1 - 10, oy + HEAD_H + 22);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK2;
      ctx.font = '400 14px ' + MONO;
      ctx.fillText(R.dm(R.dateOf(w, d)), x1 - colW + 10, oy + HEAD_H + 22);
      ctx.textAlign = 'right';
      ctx.fillStyle = LINE;
      ctx.fillRect(x1 - colW, oy + HEAD_H, 1, DAYHEAD_H + gridH);
    });
    ctx.fillStyle = LINE;
    ctx.fillRect(PAD, gridTop - 1, W - PAD * 2, 1);
    ctx.fillRect(PAD, gridTop + gridH, W - PAD * 2, 1);

    // Hour lines + labels
    ctx.font = '400 13px ' + MONO;
    ctx.textAlign = 'center';
    for (let m = Math.ceil(S.dayStart / 60) * 60; m <= S.dayEnd; m += 60) {
      const y = yOf(m);
      ctx.fillStyle = LINE_SOFT;
      ctx.fillRect(PAD, y, W - PAD * 2 - TIME_W, 1);
      if (m < S.dayEnd) { ctx.fillStyle = INK3; ctx.fillText(R.fmt(m), right - TIME_W / 2, y + (y - gridTop < 8 ? 14 : 5)); }
    }
    ctx.textAlign = 'right';

    // Event blocks
    days.forEach((d, i) => {
      const colRight = right - TIME_W - i * colW;
      const evs = S.events.filter((e) => e.week === w && e.day === d && e.end > S.dayStart && e.start < S.dayEnd);
      const pos = R.layoutDay(evs);
      evs.forEach((e) => {
        const p = pos.get(e.id), t = R.typeOf(e.type);
        const bw = colW / p.n - 6, bx = colRight - (p.col + 1) * (colW / p.n) + 3;
        const y1 = yOf(Math.max(e.start, S.dayStart)) + 2, y2 = yOf(Math.min(e.end, S.dayEnd)) - 2;
        const bh = Math.max(y2 - y1, 16);
        ctx.save();
        roundRect(ctx, bx, y1, bw, bh, 7);
        ctx.fillStyle = tint(t.color, 0.17);
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = t.color;
        ctx.fillRect(bx + bw - 5, y1, 5, bh);
        const tx = bx + bw - 13, maxW = bw - 22;
        let y = y1 + 18;
        const line = (txt, font, color, lh, max) => {
          ctx.font = font;
          ctx.fillStyle = color;
          wrap(ctx, txt, maxW).slice(0, max).forEach((l) => { if (y < y1 + bh - 3) { ctx.fillText(l, tx, y); y += lh; } });
        };
        const time = R.fmt(e.start) + '–' + R.fmt(e.end);
        if (bh < 40) {
          ctx.font = '600 14px ' + UI;
          ctx.fillStyle = INK;
          ctx.fillText((e.title || '') + '  ' + time, tx, y1 + bh / 2 + 5, maxW);
        } else {
          ctx.direction = 'ltr';
          ctx.textAlign = 'right';
          line(time, '400 12.5px ' + MONO, INK2, 18, 1);
          ctx.direction = 'rtl';
          line(e.title || 'ללא נושא', '600 15.5px ' + UI, INK, 20, 4);
          if (e.lecturer) line(e.lecturer, '400 13.5px ' + UI, INK2, 18, 3);
          if (e.location) line(e.location, '400 13.5px ' + UI, INK2, 18, 2);
          if (e.notes) line(e.notes, '400 12.5px ' + UI, INK3, 17, 4);
        }
        ctx.restore();
      });
    });
  }

  async function ensureFonts() {
    try {
      await Promise.all([
        document.fonts.load('700 34px "Frank Ruhl Libre"', 'אבג'),
        document.fonts.load('400 16px "IBM Plex Sans Hebrew"', 'אבג'),
        document.fonts.load('600 16px "IBM Plex Sans Hebrew"', 'אבג'),
        document.fonts.load('400 14px "IBM Plex Mono"', '0123')
      ]);
    } catch (e) { /* fall back to system faces */ }
  }

  function canvasFor(weeks, scale) {
    const c = document.createElement('canvas');
    c.width = W * scale;
    c.height = H * weeks.length * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    weeks.forEach((w, i) => drawWeek(ctx, w, i * H));
    return c;
  }
  const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
  const baseName = () => ((R.S.title || 'סבב סטודנטים') + ' ' + R.dmy(R.dateOf(0, R.visibleDays()[0] || 0))).replace(/[\\/:*?"<>|]/g, '-');

  async function save(filename, data) {
    const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null;
    if (dl) {
      try {
        await dl.save({ filename, data });
        R.toast('הקובץ נשמר');
      } catch (err) {
        if (err && err.code === 'declined') return;
        R.toast(err && err.code === 'rate_limited' ? 'יש כבר חלון שמירה פתוח' : 'ההורדה אינה זמינה כאן');
      }
      return;
    }
    if (window.claude) { R.toast('ההורדה אינה זמינה בתצוגה הזו'); return; }
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function exportPNG() {
    R.toast('מכין תמונה…');
    await ensureFonts();
    const weeks = Array.from({ length: R.S.weeks }, (_, i) => i);
    await save(baseName() + '.png', await toBlob(canvasFor(weeks, 1.5)));
  }

  async function exportPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) { R.toast('רכיב ה־PDF לא נטען. נסו שוב בעוד רגע.'); return; }
    R.toast('מכין PDF…');
    await ensureFonts();
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    for (let w = 0; w < R.S.weeks; w++) {
      if (w) doc.addPage('a4', 'landscape');
      const c = canvasFor([w], 2);
      doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
    }
    await save(baseName() + '.pdf', doc.output('arraybuffer'));
  }

  function asText() {
    const S = R.S, out = [S.title || 'סבב סטודנטים'];
    if (S.subtitle) out.push(S.subtitle);
    out.push(R.rangeLabel());
    for (let w = 0; w < S.weeks; w++) {
      out.push('', '*שבוע ' + (w + 1) + '*');
      R.visibleDays().forEach((d) => {
        const evs = S.events.filter((e) => e.week === w && e.day === d).sort((a, b) => a.start - b.start);
        if (!evs.length) return;
        out.push('', R.dayLabel(w, d));
        evs.forEach((e) => {
          const extra = [e.lecturer, e.location].filter(Boolean).join(', ');
          out.push('⁦' + R.fmt(e.start) + '–' + R.fmt(e.end) + '⁩ ' + (e.title || 'ללא נושא') + (extra ? ' — ' + extra : ''));
        });
      });
    }
    return out.join('\n');
  }

  function copyText(text = asText(), done = 'הלוח הועתק. אפשר להדביק בוואטסאפ או במייל.') {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      R.toast(ok ? done : 'לא הצלחתי להעתיק בדפדפן הזה');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => R.toast(done), fallback);
    } else fallback();
  }

  R.exportCanvas = canvasFor;
  R.exportText = asText;

  document.getElementById('shareMenu').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-export]');
    if (!b) return;
    document.getElementById('shareMenu').hidden = true;
    document.getElementById('btnShare').setAttribute('aria-expanded', 'false');
    const kind = b.dataset.export;
    if (kind === 'text') copyText();
    else if (kind === 'link') copyText(location.origin + location.pathname, 'הקישור הועתק. אפשר לשלוח אותו לקבוצה.');
    else if (kind === 'png') exportPNG().catch(() => R.toast('יצירת התמונה נכשלה'));
    else if (kind === 'pdf') exportPDF().catch(() => R.toast('יצירת ה־PDF נכשלה'));
  });
})();
