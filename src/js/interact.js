/* Graph Editor - mouse / keyboard interaction */
(function (GE) {
  'use strict';

  const U = GE.U;

  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.0001) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = U.clamp(t, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  function insideRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  const I = {
    app: null,
    drag: null,
    lastHover: 0,
    pointer: { x: 0, y: 0 },

    attach: function (app) {
      this.app = app;
      const canvas = app.canvas;
      canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
      canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
      canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
      canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
      canvas.addEventListener('pointerleave', this.onPointerLeave.bind(this));
      canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
      canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', this.onKeyDown.bind(this));
      window.addEventListener('blur', () => this.cancelDrag());
    },

    /* ------------------------------------------------------------ *
     * hit testing
     * ------------------------------------------------------------ */

    projectPoint: function (pick, p) {
      if (pick.mode === '3d') {
        const z = pick.floorZ.get(p.floor);
        return pick.project(p.x, p.y, z == null ? 0 : z);
      }
      return pick.project(p.x, p.y, 0);
    },

    hitTest: function (app, x, y, opts) {
      const pick = app.pick;
      if (!pick) return null;
      const hoverOnly = !!(opts && opts.hover);
      const g = app.graph;
      // layer badges are drawn on top
      for (let i = pick.floorBadges.length - 1; i >= 0; i--) {
        const b = pick.floorBadges[i];
        if (insideRect(x, y, b)) return { type: 'floor', id: b.id, badge: true };
      }
      if (app.view.transition) return null;
      // nodes
      for (let i = pick.nodeHits.length - 1; i >= 0; i--) {
        const n = pick.nodeHits[i];
        const dx = x - n.x;
        const dy = y - n.y;
        if (dx * dx + dy * dy <= n.r * n.r) return { type: 'point', id: n.id };
      }
      // edges (normal edges take precedence over cross-layer stubs)
      if (pick.mode === '2d') {
        const fid = app.view.currentFloor;
        const edges = g.getIndex().edgesByFloor.get(fid) || [];
        if (hoverOnly && edges.length > 30000) return null;
        for (let i = edges.length - 1; i >= 0; i--) {
          const e = edges[i];
          const a = g.points.get(e.a);
          const b = g.points.get(e.b);
          if (!a || !b) continue;
          if (e.a === e.b) {
            const s = pick.project(a.x, a.y, 0);
            const r = (pick.nodeRadius || GE.Render.NODE_R) * pick.cam.scale;
            const d = Math.hypot(x - s.x, y - (s.y - r * 1.25));
            if (Math.abs(d - r * 0.92) < 7) return { type: 'edge', id: e.id };
            continue;
          }
          const pa = pick.project(a.x, a.y, 0);
          const pb = pick.project(b.x, b.y, 0);
          if (distToSegment(x, y, pa.x, pa.y, pb.x, pb.y) <= 6.5) return { type: 'edge', id: e.id };
        }
        for (let i = 0; i < pick.stubHits.length; i++) {
          const s = pick.stubHits[i];
          if (insideRect(x, y, s.badge)) return { type: 'edge', id: s.edgeId };
          if (distToSegment(x, y, s.x1, s.y1, s.x2, s.y2) <= 7) return { type: 'edge', id: s.edgeId };
        }
        return null;
      }
      // 3D edges
      if (hoverOnly && g.edges.size > 30000) return null;
      const scene = pick;
      let best = null;
      let bestD = 7;
      const edges = g.getIndex().edges;
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const a = g.points.get(e.a);
        const b = g.points.get(e.b);
        if (!a || !b) continue;
        if (!scene.visibleFloors.has(a.floor) || !scene.visibleFloors.has(b.floor)) continue;
        const pa = scene.project(a.x, a.y, scene.floorZ.get(a.floor));
        const pb = scene.project(b.x, b.y, scene.floorZ.get(b.floor));
        if (!pa || !pb) continue;
        if (e.a === e.b) {
          const r = Math.max(2, (scene.nodeRadius || 18) * pa.scale);
          const d = Math.abs(Math.hypot(x - pa.x, y - (pa.y - r * 1.25)) - r * 0.92);
          if (d < bestD) {
            bestD = d;
            best = e.id;
          }
          continue;
        }
        const d = distToSegment(x, y, pa.x, pa.y, pb.x, pb.y);
        if (d < bestD) {
          bestD = d;
          best = e.id;
        }
      }
      return best == null ? null : { type: 'edge', id: best };
    },

    /* ------------------------------------------------------------ *
     * pointer events
     * ------------------------------------------------------------ */

    localPoint: function (app, e) {
      const rect = app.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },

    onPointerDown: function (e) {
      const app = this.app;
      const p = this.localPoint(app, e);
      app.canvas.focus && app.canvas.focus();
      GE.UI.hideTip();
      if (e.button === 2 || (e.button === 1 && app.view.mode === '2d')) {
        e.preventDefault();
        this.startPan(app, e);
        return;
      }
      if (e.button === 1 && app.view.mode === '3d') {
        e.preventDefault();
        this.startOrbit(app, e);
        return;
      }
      if (e.button !== 0) return;

      const hit = this.hitTest(app, p.x, p.y);
      if (app.view.camTween) app.view.camTween = null;
      if (app.view.orbitTween) app.view.orbitTween = null;

      if (hit && hit.type === 'floor') {
        const key = 'f:' + hit.id;
        if (e.shiftKey) {
          if (app.sel.has(key)) app.sel.delete(key);
          else app.sel.add(key);
        } else {
          app.sel = new Set([key]);
        }
        app.selectionChanged();
        app.setCurrentFloor(hit.id, true);
        return;
      }

      if (hit && hit.type === 'point') {
        const key = 'p:' + hit.id;
        if (e.shiftKey) {
          if (app.sel.has(key)) app.sel.delete(key);
          else app.sel.add(key);
          app.selectionChanged();
          return;
        }
        if (!app.sel.has(key)) app.sel = new Set([key]);
        app.selectionChanged();
        this.startNodeDrag(app, e, hit.id);
        return;
      }

      if (hit && hit.type === 'edge') {
        const key = 'e:' + hit.id;
        if (e.shiftKey) {
          if (app.sel.has(key)) app.sel.delete(key);
          else app.sel.add(key);
        } else {
          app.sel = new Set([key]);
        }
        app.selectionChanged();
        return;
      }

      if (!e.shiftKey) {
        app.sel.clear();
        app.selectionChanged();
      }
      this.startBoxSelect(app, e);
    },

    startPan: function (app, e) {
      this.drag = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      app.canvas.setPointerCapture(e.pointerId);
      app.canvas.style.cursor = 'grabbing';
    },

    startOrbit: function (app, e) {
      this.drag = { kind: 'orbit', lastX: e.clientX, lastY: e.clientY };
      app.canvas.setPointerCapture(e.pointerId);
      app.canvas.style.cursor = 'grabbing';
    },

    startNodeDrag: function (app, e, pointId) {
      const g = app.graph;
      const before = [];
      const starts = new Map();
      for (const key of app.sel) {
        const info = U.keyInfo(key);
        if (info.type !== 'p') continue;
        const p = g.points.get(info.id);
        if (!p) continue;
        before.push({ id: p.id, x: p.x, y: p.y });
        starts.set(p.id, { x: p.x, y: p.y });
        app.sim.pin(p.id);
      }
      let scale = 1;
      const pick = app.pick;
      if (pick) {
        for (let i = 0; i < pick.nodeHits.length; i++) {
          if (pick.nodeHits[i].id === pointId) {
            scale = pick.mode === '3d' ? pick.nodeHits[i].r / (pick.nodeRadius || GE.Render.NODE_R) : 1;
            break;
          }
        }
      }
      this.drag = {
        kind: 'node',
        startClientX: e.clientX,
        startClientY: e.clientY,
        starts: starts,
        before: before,
        moved: false,
        pointId: pointId,
        depthScale: scale || 0.001,
        startScreen: { x: this.localPoint(app, e).x, y: this.localPoint(app, e).y },
      };
      app.sim.reheat(0.65);
      app.canvas.setPointerCapture(e.pointerId);
      app.canvas.style.cursor = 'grabbing';
    },

    startBoxSelect: function (app, e) {
      const p = this.localPoint(app, e);
      const base = new Set(app.sel);
      app.boxSelect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      this.drag = { kind: 'box', startClientX: e.clientX, startClientY: e.clientY, base: base, moved: false };
      app.canvas.setPointerCapture(e.pointerId);
    },

    onPointerMove: function (e) {
      const app = this.app;
      const drag = this.drag;
      const pick = app.pick;
      if (drag) {
        if (drag.kind === 'pan') {
          const dx = e.clientX - drag.lastX;
          const dy = e.clientY - drag.lastY;
          drag.lastX = e.clientX;
          drag.lastY = e.clientY;
          if (app.view.mode === '2d') {
            app.view.cam.x -= dx / app.view.cam.scale;
            app.view.cam.y -= dy / app.view.cam.scale;
            app.view.camTween = null;
          } else if (pick) {
            const s = pick.focal / app.view.orbit.dist;
            const r = pick.right;
            const u = pick.up;
            app.view.orbit.tx -= (r.x * dx - u.x * dy) / s;
            app.view.orbit.ty -= (r.y * dx - u.y * dy) / s;
            app.view.orbit.tz -= (r.z * dx - u.z * dy) / s;
            app.view.orbitTween = null;
          }
          return;
        }
        if (drag.kind === 'orbit') {
          const dx = e.clientX - drag.lastX;
          const dy = e.clientY - drag.lastY;
          drag.lastX = e.clientX;
          drag.lastY = e.clientY;
          app.view.orbit.yaw -= dx * 0.007;
          app.view.orbit.pitch = U.clamp(app.view.orbit.pitch + dy * 0.006, -1.45, 1.45);
          app.view.orbitTween = null;
          return;
        }
        if (drag.kind === 'node') {
          const p = this.localPoint(app, e);
          const dx = p.x - drag.startScreen.x;
          const dy = p.y - drag.startScreen.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          let wx;
          let wy;
          if (app.view.mode === '3d' && pick) {
            const s = drag.depthScale || 0.001;
            const r = pick.right;
            const u = pick.up;
            wx = (r.x * dx - u.x * dy) / s;
            wy = (r.y * dx - u.y * dy) / s;
          } else {
            wx = dx / app.view.cam.scale;
            wy = dy / app.view.cam.scale;
          }
          const g = app.graph;
          for (const pid of drag.starts.keys()) {
            const start = drag.starts.get(pid);
            const pt = g.points.get(pid);
            if (!pt) continue;
            pt.x = start.x + wx;
            pt.y = start.y + wy;
            pt.vx = 0;
            pt.vy = 0;
          }
          app.sim.reheat(Math.max(app.sim.alpha, 0.14));
          return;
        }
        if (drag.kind === 'box') {
          const p = this.localPoint(app, e);
          app.boxSelect.x1 = p.x;
          app.boxSelect.y1 = p.y;
          if (Math.abs(e.clientX - drag.startClientX) + Math.abs(e.clientY - drag.startClientY) > 3) drag.moved = true;
          return;
        }
      }

      const p = this.localPoint(app, e);
      const now = U.now();
      if (now - this.lastHover < 35) return;
      this.lastHover = now;
      const hit = this.hitTest(app, p.x, p.y, { hover: true });
      if (hit) {
        app.hover = hit;
        GE.UI.showTip(app, hit, e.clientX, e.clientY);
        app.canvas.style.cursor = hit.type === 'floor' ? 'pointer' : 'pointer';
      } else {
        app.hover = null;
        GE.UI.hideTip();
        app.canvas.style.cursor = 'default';
      }
    },

    onPointerUp: function (e) {
      const app = this.app;
      const drag = this.drag;
      this.drag = null;
      if (!drag) return;
      try {
        app.canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      app.canvas.style.cursor = 'default';
      if (drag.kind === 'node') {
        for (const pid of drag.starts.keys()) app.sim.unpin(pid);
        if (drag.moved) app.commitPositions(drag.before);
        else app.selectionChanged();
      } else if (drag.kind === 'box') {
        const r = app.boxSelect;
        app.boxSelect = null;
        if (!drag.moved) {
          if (!e.shiftKey) {
            app.sel.clear();
            app.selectionChanged();
          }
          return;
        }
        const rect = {
          x: Math.min(r.x0, r.x1),
          y: Math.min(r.y0, r.y1),
          w: Math.abs(r.x1 - r.x0),
          h: Math.abs(r.y1 - r.y0),
        };
        const picked = new Set(drag.base);
        const pickedPoints = new Set();
        const pick = app.pick;
        if (pick) {
          for (let i = 0; i < pick.nodeHits.length; i++) {
            const n = pick.nodeHits[i];
            if (insideRect(n.x, n.y, rect)) {
              picked.add('p:' + n.id);
              pickedPoints.add(n.id);
            }
          }
          const g = app.graph;
          const idx = g.getIndex();
          let edges = [];
          if (pick.mode === '3d') {
            edges = idx.edges;
          } else {
            edges = idx.edgesByFloor.get(app.view.currentFloor) || [];
          }
          for (let i = 0; i < edges.length; i++) {
            const ed = edges[i];
            if (!pickedPoints.has(ed.a) || !pickedPoints.has(ed.b)) continue;
            picked.add('e:' + ed.id);
          }
        }
        app.sel = picked;
        app.selectionChanged();
      }
    },

    onPointerLeave: function () {
      const app = this.app;
      app.hover = null;
      GE.UI.hideTip();
      if (!this.drag) app.canvas.style.cursor = 'default';
    },

    onWheel: function (e) {
      e.preventDefault();
      const app = this.app;
      const p = this.localPoint(app, e);
      if (app.view.mode === '2d') {
        const cam = app.view.cam;
        const old = cam.scale;
        const factor = Math.exp(-e.deltaY * 0.0015);
        const next = U.clamp(old * factor, 0.02, 8);
        const wx = (p.x - app.W / 2) / old + cam.x;
        const wy = (p.y - app.H / 2) / old + cam.y;
        cam.scale = next;
        cam.x = wx - (p.x - app.W / 2) / next;
        cam.y = wy - (p.y - app.H / 2) / next;
        app.view.camTween = null;
      } else {
        const factor = Math.exp(e.deltaY * 0.0015);
        app.view.orbit.dist = U.clamp(app.view.orbit.dist * factor, 180, 90000);
        app.view.orbitTween = null;
      }
    },

    onDoubleClick: function (e) {
      const app = this.app;
      const p = this.localPoint(app, e);
      const hit = this.hitTest(app, p.x, p.y);
      if (!hit) return;
      e.preventDefault();
      if (hit.type === 'floor') {
        app.sel = new Set(['f:' + hit.id]);
        app.selectionChanged();
        app.setCurrentFloor(hit.id, true);
        GE.UI.openFloorProps(app, hit.id);
      } else {
        app.sel = new Set([hit.type === 'point' ? 'p:' + hit.id : 'e:' + hit.id]);
        app.selectionChanged();
        if (hit.type === 'point') {
          const pt = app.graph.points.get(hit.id);
          if (pt) GE.UI.openPointProps(app, pt);
        } else {
          const ed = app.graph.edges.get(hit.id);
          if (ed) GE.UI.openEdgeProps(app, ed);
        }
      }
    },

    /* ------------------------------------------------------------ *
     * keyboard
     * ------------------------------------------------------------ */

    onKeyDown: function (e) {
      const app = this.app;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) {
        return;
      }
      if (GE.UI.modalCount > 0) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      if (mod) {
        const k = key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) app.redo();
          else app.undo();
          return;
        }
        if (k === 'y') {
          e.preventDefault();
          app.redo();
          return;
        }
        if (k === 'a') {
          e.preventDefault();
          app.selectAll();
          return;
        }
        if (k === 'c') {
          e.preventDefault();
          app.copySelection();
          return;
        }
        if (k === 'x') {
          e.preventDefault();
          app.cutSelection();
          return;
        }
        if (k === 'v') {
          e.preventDefault();
          app.pasteSelection();
          return;
        }
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        app.deleteSelection();
        return;
      }
      if (key === 'Escape') {
        GE.UI.hideTip();
        this.cancelDrag();
        return;
      }
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        app.fit(true);
        return;
      }
      if (key === 'g' || key === 'G') {
        e.preventDefault();
        app.toggleGrid();
        return;
      }
      if (key === 'p' || key === 'P') {
        e.preventDefault();
        app.togglePhysics();
        return;
      }
      if (key === '3') {
        e.preventDefault();
        app.setMode(app.view.mode === '2d' ? '3d' : '2d');
        return;
      }
      if (key === '?') {
        e.preventDefault();
        app.openGuide();
        return;
      }
      if (key === '+' || key === '=') {
        e.preventDefault();
        this.zoomCenter(1.2);
        return;
      }
      if (key === '-' || key === '_') {
        e.preventDefault();
        this.zoomCenter(1 / 1.2);
        return;
      }
      if (key === '0') {
        e.preventDefault();
        app.fit(true);
      }
    },

    cancelDrag: function () {
      const app = this.app;
      const drag = this.drag;
      if (drag && drag.kind === 'node' && app) {
        for (const pid of drag.starts.keys()) app.sim.unpin(pid);
      }
      this.drag = null;
      if (app) {
        app.boxSelect = null;
        app.canvas.style.cursor = 'default';
      }
    },

    zoomCenter: function (factor) {
      const app = this.app;
      if (app.view.mode === '2d') {
        app.view.cam.scale = U.clamp(app.view.cam.scale * factor, 0.02, 8);
        app.view.camTween = null;
      } else {
        app.view.orbit.dist = U.clamp(app.view.orbit.dist / factor, 180, 90000);
        app.view.orbitTween = null;
      }
    },
  };

  GE.Interaction = I;
})(globalThis.GE = globalThis.GE || {});
