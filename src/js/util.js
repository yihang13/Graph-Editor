/* Graph Editor - shared helpers (no DOM access at load time) */
(function (GE) {
  'use strict';

  const U = {};

  U.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };

  /* Canvas-wide display preferences (not graph data). */
  U.EDGE_WIDTH = { DEFAULT: 2, MIN: 0.5, MAX: 12 };
  U.NODE_RADIUS = { DEFAULT: 18, MIN: 8, MAX: 40 };
  U.SPACING_SCALE = { DEFAULT: 1, MIN: 0.5, MAX: 2.5 };
  U.DEFAULT_LAYER_COLOR = '#2563eb';

  const NUM_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const INT_RE = /^[+-]?\d+$/;
  const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  U.NUM_RE = NUM_RE;
  U.INT_RE = INT_RE;
  U.COLOR_RE = COLOR_RE;

  U.isNumberToken = function (s) {
    return typeof s === 'string' && NUM_RE.test(s);
  };
  U.isIntToken = function (s) {
    return typeof s === 'string' && INT_RE.test(s);
  };
  U.isColorToken = function (s) {
    return typeof s === 'string' && COLOR_RE.test(s);
  };
  U.num = function (s) {
    return Number(s);
  };
  U.int = function (s) {
    return parseInt(s, 10);
  };

  U.normColor = function (s) {
    if (typeof s !== 'string' || !COLOR_RE.test(s)) return null;
    let h = s.slice(1).toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return '#' + h;
  };

  /** Parse a weight string: null, "1.5" or "(1,2,3)". */
  U.parseWeight = function (input) {
    if (input == null) return { ok: true, value: null };
    const s = String(input).trim();
    if (!s) return { ok: true, value: null };
    if (s.charAt(0) === '(') {
      if (s.charAt(s.length - 1) !== ')') return { ok: false };
      const body = s.slice(1, -1).trim();
      if (!body) return { ok: false };
      const parts = body.split(',');
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        const t = parts[i].trim();
        if (!NUM_RE.test(t)) return { ok: false };
        out.push(Number(t));
      }
      return { ok: true, value: out };
    }
    if (!NUM_RE.test(s)) return { ok: false };
    return { ok: true, value: Number(s) };
  };

  U.numText = function (n) {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    return String(n);
  };

  U.weightText = function (w) {
    if (w == null) return '';
    if (Array.isArray(w)) {
      const parts = [];
      for (let i = 0; i < w.length; i++) parts.push(U.numText(w[i]));
      return '(' + parts.join(',') + ')';
    }
    return U.numText(w);
  };

  U.sameWeight = function (a, b) {
    if (a == null && b == null) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    return a === b;
  };

  U.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** Truncate a description to at most `n` code points, appending an ellipsis. */
  U.truncate = function (s, n) {
    if (s == null) return '';
    const limit = n || 5;
    const chars = Array.from(String(s));
    if (chars.length <= limit) return chars.join('');
    return chars.slice(0, limit).join('') + '\u2026';
  };

  U.clonePoint = function (p) {
    return {
      id: p.id,
      floor: p.floor,
      weight: Array.isArray(p.weight) ? p.weight.slice() : p.weight,
      color: p.color,
      desc: p.desc,
      x: p.x,
      y: p.y,
      vx: p.vx || 0,
      vy: p.vy || 0,
    };
  };

  U.cloneEdge = function (e) {
    return {
      id: e.id,
      a: e.a,
      b: e.b,
      directed: !!e.directed,
      weight: Array.isArray(e.weight) ? e.weight.slice() : e.weight,
      color: e.color,
      desc: e.desc,
    };
  };

  U.cloneFloor = function (f) {
    return { id: f.id, visible: !!f.visible, desc: f.desc || '', color: f.color || U.DEFAULT_LAYER_COLOR };
  };

  U.sameJson = function (a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  };

  U.hexRgb = function (hex) {
    let h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) h = '000000';
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };

  U.rgba = function (hex, alpha) {
    const c = U.hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  };

  U.luminance = function (hex) {
    const c = U.hexRgb(hex);
    const lin = function (v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  };

  U.contrastText = function (hex) {
    return U.luminance(hex) > 0.45 ? '#111827' : '#ffffff';
  };

  U.now = function () {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  };

  U.debounce = function (fn, wait) {
    let timer = null;
    let pendingArgs = null;
    function wrapped() {
      pendingArgs = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        const args = pendingArgs;
        pendingArgs = null;
        fn.apply(null, args);
      }, wait);
    }
    wrapped.cancel = function () {
      if (timer) clearTimeout(timer);
      timer = null;
      pendingArgs = null;
    };
    wrapped.flush = function () {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      const args = pendingArgs;
      pendingArgs = null;
      fn.apply(null, args);
    };
    return wrapped;
  };

  U.throttle = function (fn, wait) {
    let last = 0;
    let timer = null;
    let pendingArgs = null;
    function wrapped() {
      pendingArgs = arguments;
      const now = Date.now();
      const remain = wait - (now - last);
      if (remain <= 0) {
        last = now;
        fn.apply(null, pendingArgs);
        pendingArgs = null;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      } else if (!timer) {
        timer = setTimeout(function () {
          timer = null;
          last = Date.now();
          fn.apply(null, pendingArgs);
          pendingArgs = null;
        }, remain);
      }
    }
    wrapped.cancel = function () {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    return wrapped;
  };

  U.roundRectPath = function (ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  };

  U.formatInt = function (n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  U.pointKey = function (id) {
    return 'p:' + id;
  };
  U.edgeKey = function (id) {
    return 'e:' + id;
  };
  U.floorKey = function (id) {
    return 'f:' + id;
  };
  U.keyInfo = function (key) {
    const i = key.indexOf(':');
    return { type: key.slice(0, i), id: Number(key.slice(i + 1)) };
  };

  U.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  };

  U.timestamp = function () {
    const d = new Date();
    const p = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    );
  };

  GE.U = U;
})(globalThis.GE = globalThis.GE || {});
