/* Graph Editor - initial layout and force-directed simulation */
(function (GE) {
  'use strict';

  const U = GE.U;

  const GRAVITY = 0.0016;
  const MAX_VELOCITY = 26;
  const THETA2 = 0.81;
  const BRUTE_LIMIT = 260;

  const DEFAULT_PARAMS = {
    repulsion: 9000,
    spring: 0.028,
    restLength: 112,
    damping: 0.86,
  };

  const PARAM_RANGES = {
    repulsion: { min: 0, max: 30000, step: 500 },
    spring: { min: 0.004, max: 0.08, step: 0.002 },
    restLength: { min: 40, max: 300, step: 1 },
    damping: { min: 0.5, max: 0.99, step: 0.01 },
  };

  function seedPoint(p, index, total) {
    if (p.x != null && p.y != null) return;
    const angle = index * 2.399963229728653;
    const radius = 26 + 17 * Math.sqrt(index + 0.35);
    p.x = Math.cos(angle) * radius + (Math.random() - 0.5) * 2;
    p.y = Math.sin(angle) * radius + (Math.random() - 0.5) * 2;
    p.vx = 0;
    p.vy = 0;
  }

  function seed(graph) {
    const idx = graph.getIndex();
    for (let fi = 0; fi < idx.floors.length; fi++) {
      const f = idx.floors[fi];
      const pts = idx.byFloor.get(f.id) || [];
      for (let i = 0; i < pts.length; i++) seedPoint(pts[i], i, pts.length);
    }
    // points that lost their floor still need a position
    for (let i = 0; i < idx.points.length; i++) seedPoint(idx.points[i], i, idx.points.length);
    graph.bump();
  }

  function makeQuad(points, depth) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const node = {
      x0: minX,
      y0: minY,
      x1: maxX,
      y1: maxY,
      mass: 0,
      cx: 0,
      cy: 0,
      kids: null,
      pts: null,
    };
    const w = maxX - minX;
    const h = maxY - minY;
    if (points.length <= 4 || depth >= 18 || w < 1e-6 || h < 1e-6) {
      node.pts = points;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < points.length; i++) {
        sx += points[i].x;
        sy += points[i].y;
      }
      node.mass = points.length;
      node.cx = sx / points.length;
      node.cy = sy / points.length;
      return node;
    }
    const mx = (minX + maxX) / 2;
    const my = (minY + maxY) / 2;
    const groups = [[], [], [], []];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const gi = (p.x < mx ? 0 : 1) + (p.y < my ? 0 : 2);
      groups[gi].push(p);
    }
    node.kids = [];
    let mass = 0;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 4; i++) {
      if (!groups[i].length) continue;
      const kid = makeQuad(groups[i], depth + 1);
      node.kids.push(kid);
      mass += kid.mass;
      sx += kid.cx * kid.mass;
      sy += kid.cy * kid.mass;
    }
    node.mass = mass;
    node.cx = sx / mass;
    node.cy = sy / mass;
    return node;
  }

  function repelFrom(p, node, out, repulsion) {
    const dx = node.cx - p.x;
    const dy = node.cy - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 0.0001) return;
    if (node.kids) {
      const size = Math.max(node.x1 - node.x0, node.y1 - node.y0);
      if (size * size < THETA2 * d2) {
        const inv = 1 / Math.sqrt(d2);
        const f = (repulsion * node.mass) / Math.max(d2, 9);
        out.fx += dx * inv * f;
        out.fy += dy * inv * f;
        return;
      }
      for (let i = 0; i < node.kids.length; i++) repelFrom(p, node.kids[i], out, repulsion);
      return;
    }
    const pts = node.pts;
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      if (q === p) continue;
      const qdx = p.x - q.x;
      const qdy = p.y - q.y;
      const qd2 = qdx * qdx + qdy * qdy;
      if (qd2 < 0.0001 || qd2 > 250000) continue;
      const inv = 1 / Math.sqrt(qd2);
      const f = repulsion / Math.max(qd2, 9);
      out.fx -= qdx * inv * f;
      out.fy -= qdy * inv * f;
    }
  }

  function bounds(points) {
    if (!points || !points.length) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x == null || p.y == null) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  class Sim {
    constructor(graph, params) {
      this.graph = graph;
      this.alpha = 0;
      this.params = Object.assign({}, DEFAULT_PARAMS);
      if (params) this.setParams(params);
      this.pinned = new Set();
      this._out = { fx: 0, fy: 0 };
      this._edgeCursor = 0;
      this._maxEdgesPerStep = 30000;
    }

    setParams(patch) {
      if (!patch) return this.params;
      for (const key in patch) {
        if (!Object.prototype.hasOwnProperty.call(PARAM_RANGES, key)) continue;
        const range = PARAM_RANGES[key];
        const value = Number(patch[key]);
        if (!isFinite(value)) continue;
        this.params[key] = U.clamp(value, range.min, range.max);
      }
      return this.params;
    }

    reheat(alpha) {
      this.alpha = Math.max(this.alpha, alpha == null ? 1 : alpha);
    }

    pin(id) {
      this.pinned.add(id);
    }
    unpin(id) {
      this.pinned.delete(id);
    }
    clearPins() {
      this.pinned.clear();
    }

    step() {
      const g = this.graph;
      const idx = g.getIndex();
      const points = idx.points;
      if (!points.length) {
        this.alpha = 0;
        return false;
      }
      if (this.alpha <= 0) return false;

      const P = this.params;
      const i0 = 0;
      const n = points.length;
      for (let i = i0; i < n; i++) {
        const p = points[i];
        p.fx = -p.x * GRAVITY;
        p.fy = -p.y * GRAVITY;
      }

      // Repulsion per floor (hidden floors included)
      if (P.repulsion > 0) for (let fi = 0; fi < idx.floors.length; fi++) {
        const f = idx.floors[fi];
        const pts = idx.byFloor.get(f.id) || [];
        if (pts.length < 2) continue;
        if (pts.length <= BRUTE_LIMIT) {
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            for (let j = i + 1; j < pts.length; j++) {
              const q = pts[j];
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < 0.0001 || d2 > 250000) continue;
              const inv = 1 / Math.sqrt(d2);
              const fm = P.repulsion / Math.max(d2, 9);
              const fx = dx * inv * fm;
              const fy = dy * inv * fm;
              p.fx += fx;
              p.fy += fy;
              q.fx -= fx;
              q.fy -= fy;
            }
          }
        } else {
          const tree = makeQuad(pts, 0);
          const out = this._out;
          for (let i = 0; i < pts.length; i++) {
            out.fx = 0;
            out.fy = 0;
            repelFrom(pts[i], tree, out, P.repulsion);
            pts[i].fx += out.fx;
            pts[i].fy += out.fy;
          }
        }
      }

      // Springs (sampled for huge graphs)
      const edges = idx.edges;
      const E = edges.length;
      const stride = E > this._maxEdgesPerStep ? Math.ceil(E / this._maxEdgesPerStep) : 1;
      let start = 0;
      if (stride > 1) {
        start = this._edgeCursor % stride;
        this._edgeCursor = (this._edgeCursor + 1) % stride;
      }
      for (let i = start; i < E; i += stride) {
        const e = edges[i];
        const a = g.points.get(e.a);
        const b = g.points.get(e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.001 || d > 4000) continue;
        const diff = (d - P.restLength) * P.spring;
        const fx = (dx / d) * diff;
        const fy = (dy / d) * diff;
        a.fx += fx;
        a.fy += fy;
        b.fx -= fx;
        b.fy -= fy;
      }

      // Integrate
      const damping = P.damping;
      for (let i = 0; i < n; i++) {
        const p = points[i];
        if (this.pinned.has(p.id)) {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        let vx = (p.vx + p.fx) * damping;
        let vy = (p.vy + p.fy) * damping;
        if (vx > MAX_VELOCITY) vx = MAX_VELOCITY;
        else if (vx < -MAX_VELOCITY) vx = -MAX_VELOCITY;
        if (vy > MAX_VELOCITY) vy = MAX_VELOCITY;
        else if (vy < -MAX_VELOCITY) vy = -MAX_VELOCITY;
        p.vx = vx;
        p.vy = vy;
        p.x += vx;
        p.y += vy;
      }

      this.alpha *= 0.984;
      // alpha is only the run/settle gate here; keep it above zero while
      // physics is enabled so a drag does not silently stop the simulation.
      if (this.alpha < 0.012) this.alpha = 0.012;
      return true;
    }
  }

  GE.Layout = {
    seed: seed,
    bounds: bounds,
    Sim: Sim,
    DEFAULT_PARAMS: DEFAULT_PARAMS,
    PARAM_RANGES: PARAM_RANGES,
  };
})(globalThis.GE = globalThis.GE || {});
