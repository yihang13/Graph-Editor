/* Graph Editor - canvas renderer (2D layer slice + 3D multi-layer) */
(function (GE) {
  'use strict';

  const U = GE.U;

  const NODE_R = U.NODE_RADIUS.DEFAULT;
  const FOV = Math.PI / 4;

  const THEME = {
    bg: '#fbfcfe',
    grid: '#e9eef6',
    gridMajor: '#dde5f0',
    edge: '#475569',
    accent: '#4f46e5',
    accentSoft: 'rgba(79,70,229,0.16)',
    hover: '#f59e0b',
    text: '#0f172a',
    muted: '#64748b',
    labelBg: 'rgba(255,255,255,0.9)',
    planeFill: 'rgba(99,102,241,0.045)',
    planeFillActive: 'rgba(79,70,229,0.11)',
    planeStroke: 'rgba(99,102,241,0.3)',
    planeStrokeActive: 'rgba(79,70,229,0.75)',
  };

  function font(size, weight) {
    return (weight || 500) + ' ' + size + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans SC", sans-serif';
  }

  function drawPill(ctx, text, x, y, opts) {
    opts = opts || {};
    const fs = opts.fontSize || 11;
    const padX = opts.padX == null ? 8 : opts.padX;
    const padY = opts.padY == null ? 4 : opts.padY;
    ctx.font = font(fs, opts.weight || 600);
    const w = ctx.measureText(text).width + padX * 2;
    const h = fs + padY * 2;
    const x0 = x - w / 2;
    const y0 = y - h / 2;
    U.roundRectPath(ctx, x0, y0, w, h, h / 2);
    ctx.fillStyle = opts.bg || THEME.labelBg;
    ctx.fill();
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = opts.color || THEME.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    return { x: x0, y: y0, w: w, h: h };
  }

  function haloText(ctx, text, x, y, color, size, weight) {
    ctx.font = font(size, weight || 500);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawArrow(ctx, x, y, angle, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size * 0.52);
    ctx.lineTo(-size * 0.72, 0);
    ctx.lineTo(-size, -size * 0.52);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function gridStep(scale) {
    const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] * scale >= 26) return steps[i];
    }
    return 100000;
  }

  /* ------------------------------------------------------------------ *
   * Scenes
   * ------------------------------------------------------------------ */

  function make2DScene(app, W, H, view) {
    const cam = view.cam;
    const project = function (x, y, z) {
      return {
        x: (x - cam.x) * cam.scale + W / 2,
        y: (y - cam.y) * cam.scale + H / 2,
        depth: 1,
        scale: cam.scale,
        ok: true,
      };
    };
    return {
      mode: '2d',
      W: W,
      H: H,
      cam: cam,
      project: project,
      graph: app.graph,
      nodeHits: [],
      floorBadges: [],
      stubHits: [],
      currentFloor: view.currentFloor,
      spacing: 0,
      edgeWidth: U.clamp(Number(view.edgeWidth) || U.EDGE_WIDTH.DEFAULT, U.EDGE_WIDTH.MIN, U.EDGE_WIDTH.MAX),
      nodeRadius: U.clamp(Number(view.nodeRadius) || U.NODE_RADIUS.DEFAULT, U.NODE_RADIUS.MIN, U.NODE_RADIUS.MAX),
      includeHidden: false,
      transition: null,
    };
  }

  function make3DScene(app, W, H, view, opts) {
    const orbit = view.orbit;
    const spacing = view.spacing;
    const idx = app.graph.getIndex();
    const floorZ = new Map();
    for (let i = 0; i < idx.floors.length; i++) {
      floorZ.set(idx.floors[i].id, (i - (idx.floors.length - 1) / 2) * spacing);
    }
    const cp = Math.cos(orbit.pitch);
    const sp = Math.sin(orbit.pitch);
    const cy = Math.cos(orbit.yaw);
    const sy = Math.sin(orbit.yaw);
    const dir = { x: cp * sy, y: cp * cy, z: sp };
    const camPos = {
      x: orbit.tx + dir.x * orbit.dist,
      y: orbit.ty + dir.y * orbit.dist,
      z: orbit.tz + dir.z * orbit.dist,
    };
    const fwd = { x: -dir.x, y: -dir.y, z: -dir.z };
    // right = normalize(up x fwd), up = fwd x right
    let rx = -fwd.y;
    let ry = fwd.x;
    let rz = 0;
    let rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-6) {
      rx = 1;
      ry = 0;
      rz = 0;
      rl = 1;
    }
    rx /= rl;
    ry /= rl;
    rz /= rl;
    const ux = fwd.y * rz - fwd.z * ry;
    const uy = fwd.z * rx - fwd.x * rz;
    const uz = fwd.x * ry - fwd.y * rx;
    const focal = H / 2 / Math.tan(FOV / 2);
    const project = function (x, y, z) {
      const dx = x - camPos.x;
      const dy = y - camPos.y;
      const dz = z - camPos.z;
      const depth = dx * fwd.x + dy * fwd.y + dz * fwd.z;
      if (depth <= 2) return null;
      const s = focal / depth;
      return {
        x: W / 2 + (dx * rx + dy * ry + dz * rz) * s,
        y: H / 2 - (dx * ux + dy * uy + dz * uz) * s,
        depth: depth,
        scale: s,
        ok: true,
      };
    };
    const includeHidden = !!opts.includeHidden;
    const visibleFloors = new Set();
    for (let i = 0; i < idx.floors.length; i++) {
      const f = idx.floors[i];
      if (includeHidden || f.visible) visibleFloors.add(f.id);
    }
    return {
      mode: '3d',
      W: W,
      H: H,
      graph: app.graph,
      project: project,
      nodeHits: [],
      floorBadges: [],
      stubHits: [],
      currentFloor: view.currentFloor,
      spacing: spacing,
      edgeWidth: U.clamp(Number(view.edgeWidth) || U.EDGE_WIDTH.DEFAULT, U.EDGE_WIDTH.MIN, U.EDGE_WIDTH.MAX),
      nodeRadius: U.clamp(Number(view.nodeRadius) || U.NODE_RADIUS.DEFAULT, U.NODE_RADIUS.MIN, U.NODE_RADIUS.MAX),
      floorZ: floorZ,
      orbit: orbit,
      camPos: camPos,
      fwd: fwd,
      right: { x: rx, y: ry, z: rz },
      up: { x: ux, y: uy, z: uz },
      focal: focal,
      visibleFloors: visibleFloors,
      includeHidden: includeHidden,
    };
  }

  /* ------------------------------------------------------------------ *
   * 2D drawing
   * ------------------------------------------------------------------ */

  function drawGrid2D(ctx, scene) {
    const cam = scene.cam;
    const step = gridStep(cam.scale);
    const x0 = cam.x - scene.W / 2 / cam.scale;
    const x1 = cam.x + scene.W / 2 / cam.scale;
    const y0 = cam.y - scene.H / 2 / cam.scale;
    const y1 = cam.y + scene.H / 2 / cam.scale;
    const startX = Math.floor(x0 / step) * step;
    const startY = Math.floor(y0 / step) * step;
    const majorEvery = 5;
    ctx.lineWidth = 1;
    for (let x = startX; x <= x1; x += step) {
      const sx = (x - cam.x) * cam.scale + scene.W / 2;
      const major = Math.round(x / step) % majorEvery === 0;
      ctx.strokeStyle = major ? THEME.gridMajor : THEME.grid;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, scene.H);
      ctx.stroke();
    }
    for (let y = startY; y <= y1; y += step) {
      const sy = (y - cam.y) * cam.scale + scene.H / 2;
      const major = Math.round(y / step) % majorEvery === 0;
      ctx.strokeStyle = major ? THEME.gridMajor : THEME.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(scene.W, sy + 0.5);
      ctx.stroke();
    }
  }

  function edgeLabel(e) {
    let text = '';
    if (e.weight != null) text = U.weightText(e.weight);
    if (e.desc) text += (text ? ' ' : '') + U.truncate(e.desc, 5);
    return text;
  }

  function edgeStrokeWidth(base, selected, hovered) {
    if (hovered) return Math.max(base + 1.2, 2.8);
    if (selected) return Math.max(base + 0.8, 2.4);
    return base;
  }

  function edgeArrowSize(base, zoom) {
    const z = Math.max(0.5, Math.min(8, zoom == null ? 1 : zoom));
    // Keep the arrow proportional to the line width (not a fixed +6px),
    // then scale it with the current zoom.
    return Math.max(6, Math.min(80, Math.max(6, base * 2.6) * z));
  }

  function drawEdge2D(ctx, scene, app, e, aS, bS, rA, rB, selected, hovered) {
    const color = hovered ? THEME.hover : selected ? THEME.accent : e.color || THEME.edge;
    const baseW = scene.edgeWidth;
    const width = edgeStrokeWidth(baseW, selected, hovered);
    const arrow = edgeArrowSize(baseW, scene.cam.scale);
    const a = app.graph.points.get(e.a);
    const b = app.graph.points.get(e.b);
    if (!a || !b) return;

    if (e.a === e.b) {
      const r = Math.min(rA, rB);
      ctx.beginPath();
      ctx.arc(aS.x, aS.y - r * 1.25, r * 0.92, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      if (e.directed) {
        const cy = aS.y - r * 1.25;
        const rr = r * 0.92;
        const ang = -Math.PI / 4;
        const ax = aS.x + Math.cos(ang) * rr;
        const ay = cy + Math.sin(ang) * rr;
        drawArrow(
          ctx,
          ax,
          ay,
          ang + Math.PI / 2,
          Math.max(arrow, Math.min(64, rr * 0.35 * (0.7 + baseW / 10))),
          color
        );
      }
      if (scene.showEdgeLabels) {
        const label = edgeLabel(e);
        if (label) {
          drawPill(ctx, label, aS.x, aS.y - r * 2.17 - 12, {
            fontSize: 10,
            color: selected ? THEME.accent : THEME.muted,
          });
        }
      }
      return;
    }

    let dx = bS.x - aS.x;
    let dy = bS.y - aS.y;
    let d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d;
    const uy = dy / d;
    const trimA = Math.min(rA + 1, d * 0.45);
    // Thicker strokes get a slightly smaller node gap so the arrow visually
    // moves forward toward the target; thin lines keep the 5px breathing gap.
    const arrowGap = Math.max(0, 5 - (baseW - 2) * 0.5);
    const trimB = Math.min(rB + arrowGap, d * 0.45);
    const x1 = aS.x + ux * trimA;
    const y1 = aS.y + uy * trimA;
    const x2 = bS.x - ux * trimB;
    const y2 = bS.y - uy * trimB;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash([]);
    ctx.stroke();

    if (e.directed) {
      drawArrow(ctx, x2, y2, Math.atan2(dy, dx), arrow + (selected ? 1 : 0), color);
    }

    if (scene.showEdgeLabels) {
      const label = edgeLabel(e);
      if (label) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const nx = -uy;
        const ny = ux;
        const off = Math.max(11, scene.edgeWidth * 0.6 + 6);
        drawPill(ctx, label, mx + nx * off, my + ny * off, {
          fontSize: Math.max(9, Math.min(13, 8 + scene.cam.scale * 1.6)),
          color: selected ? THEME.accent : THEME.muted,
          padX: 5,
          padY: 2,
          bg: 'rgba(255,255,255,0.82)',
        });
      }
    }
  }

  function drawStub2D(ctx, scene, app, e, p, other, selected, hovered, center, angleOffset) {
    const g = app.graph;
    const pS = scene.project(p.x, p.y, 0);
    /* Point away from the layer's centre instead of toward the remote endpoint.
       A stub aimed at the remote node can run on top of a real edge; an
       outward stub + drawing underneath normal edges keeps the graph readable. */
    let dx = p.x - center.x;
    let dy = p.y - center.y;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) {
      const ang = (p.id * 2.399963) % (Math.PI * 2);
      dx = Math.cos(ang);
      dy = Math.sin(ang);
      d = 1;
    }
    let ux = dx / d;
    let uy = dy / d;
    if (angleOffset) {
      const co = Math.cos(angleOffset);
      const si = Math.sin(angleOffset);
      const rx = ux * co - uy * si;
      const ry = ux * si + uy * co;
      ux = rx;
      uy = ry;
    }
    const nodeR = scene.nodeRadius * scene.cam.scale;
    const startX = pS.x + ux * (nodeR + 2);
    const startY = pS.y + uy * (nodeR + 2);
    const maxLen = Math.max(10, nodeR * 2.6);
    let len = maxLen;
    const margin = 18;
    if (ux > 0) len = Math.min(len, (scene.W - margin - startX) / ux);
    else if (ux < 0) len = Math.min(len, (margin - startX) / ux);
    if (uy > 0) len = Math.min(len, (scene.H - margin - startY) / uy);
    else if (uy < 0) len = Math.min(len, (margin - startY) / uy);
    if (!isFinite(len) || len < 12) return;
    const endX = startX + ux * len;
    const endY = startY + uy * len;
    const color = hovered ? THEME.hover : selected ? THEME.accent : U.rgba(e.color || '#475569', 0.75);
    const dash = Math.max(3, nodeR * 0.22);
    ctx.setLineDash([dash, dash * 0.7]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = color;
    const baseW = scene.edgeWidth;
    const stubW = baseW;
    ctx.lineWidth = hovered || selected ? Math.max(stubW + 0.8, 2.4) : stubW;
    ctx.stroke();
    ctx.setLineDash([]);
    const arrowSize = Math.max(baseW * 1.8, nodeR * 0.18 * (0.7 + baseW / 10));
    drawArrow(ctx, endX, endY, Math.atan2(uy, ux), arrowSize, color);
    const label = '层 ' + g.floorDisp(other.floor);
    const badgeFont = Math.max(8, nodeR * 0.24);
    const badgeOffset = Math.max(10, nodeR * 0.45);
    const badge = drawPill(ctx, label, endX - ux * badgeOffset, endY - uy * badgeOffset, {
      fontSize: badgeFont,
      color: selected ? THEME.accent : THEME.muted,
      stroke: selected ? THEME.accent : 'rgba(148,163,184,0.55)',
      padX: 5,
      padY: 2,
    });
    scene.stubHits.push({
      edgeId: e.id,
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      badge: badge,
    });
  }

  function drawNode2D(ctx, scene, app, p, sx, sy, r) {
    const g = app.graph;
    const selected = app.sel.has('p:' + p.id);
    const hovered = app.hover && app.hover.type === 'point' && app.hover.id === p.id;
    const fill = p.color || '#000000';
    if (r >= 0.8) {
      if (selected) {
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.18, 0, Math.PI * 2);
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = Math.max(2, r * 0.09);
        ctx.stroke();
      }
      if (hovered) {
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.26, 0, Math.PI * 2);
        ctx.strokeStyle = THEME.hover;
        ctx.lineWidth = Math.max(1.5, r * 0.06);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = U.luminance(fill) > 0.8 ? '#cbd5e1' : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    scene.nodeHits.push({ id: p.id, x: sx, y: sy, r: Math.max(r + 4, 6) });

    if (r >= 6) {
      const idText = String(g.pointDisp(p.id));
      const fs = Math.min(34, Math.max(7, r * 0.58));
      ctx.font = font(fs, 600);
      const tw = ctx.measureText(idText).width;
      const shrink = Math.min(1, (r * 1.55) / Math.max(1, tw));
      const size = Math.max(6, fs * shrink);
      ctx.font = font(size, 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = U.contrastText(fill);
      const hasWeight = p.weight != null;
      const yOff = hasWeight && r >= 11 ? -r * 0.16 : 0;
      ctx.fillText(idText, sx, sy + yOff);
      if (hasWeight && r >= 11) {
        ctx.font = font(Math.max(6, Math.min(22, r * 0.32)), 500);
        ctx.fillStyle = U.contrastText(fill);
        ctx.globalAlpha = 0.92;
        ctx.fillText(U.weightText(p.weight), sx, sy + r * 0.46);
        ctx.globalAlpha = 1;
      }
    }
    if (r >= 9 && p.desc) {
      const df = Math.min(18, Math.max(9, r * 0.32));
      haloText(ctx, U.truncate(p.desc, 5), sx, sy + r + df * 0.9, THEME.muted, df, 500);
    }
  }

  function drawFloorBadge2D(ctx, scene, app, fid) {
    const g = app.graph;
    const floor = g.floors.get(fid);
    if (!floor) return;
    const desc = floor.desc ? ' · ' + U.truncate(floor.desc, 14) : '';
    const text = '层 ' + g.floorDisp(fid) + desc;
    const color = floor.color || U.DEFAULT_LAYER_COLOR;
    const badge = drawPill(ctx, text, 84, 26, {
      fontSize: 12,
      color: '#1e293b',
      bg: U.rgba(color, 0.11),
      stroke: U.rgba(color, 0.52),
      padX: 18,
      padY: 6,
    });
    ctx.beginPath();
    ctx.arc(badge.x + 9, badge.y + badge.h / 2, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    scene.floorBadges.push({ id: fid, x: badge.x, y: badge.y, w: badge.w, h: badge.h });
  }

  function draw2D(app, ctx, scene, view, opts) {
    const g = app.graph;
    const idx = g.getIndex();
    let floors = [];
    let transition = null;
    if (!opts.exporting && view.transition) {
      const t = U.clamp((U.now() - view.transition.start) / view.transition.dur, 0, 1);
      const eased = t * t * (3 - 2 * t);
      if (t >= 1) {
        view.transition = null;
      } else {
        transition = { t: t, eased: eased };
      }
    }
    if (!transition) {
      floors = [{ id: view.currentFloor, alpha: 1, yOff: 0, primary: true }];
    } else {
      floors = [
        { id: view.transition.from, alpha: 1 - transition.eased, yOff: -14 * transition.eased, primary: false },
        { id: view.transition.to, alpha: transition.eased, yOff: 14 * (1 - transition.eased), primary: true },
      ];
    }

    for (let fi = 0; fi < floors.length; fi++) {
      const ent = floors[fi];
      if (!g.floors.has(ent.id)) continue;
      const pts = idx.byFloor.get(ent.id) || [];
      const edges = idx.edgesByFloor.get(ent.id) || [];
      const cross = idx.crossByFloor.get(ent.id) || [];
      const scale = scene.cam.scale;
      let labelBudget = 0;
      if (scale >= 1.2) labelBudget = 6000;
      else if (scale >= 0.8) labelBudget = 1200;
      else if (scale >= 0.45) labelBudget = 120;
      scene.showEdgeLabels = labelBudget > 0 && edges.length <= labelBudget;
      ctx.globalAlpha = ent.alpha;
      const yOff = ent.yOff;

      /* cross-layer stubs are drawn first so real edges always stay on top */
      const center = { x: 0, y: 0 };
      let centerCount = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (q.x == null || q.y == null) continue;
        center.x += q.x;
        center.y += q.y;
        centerCount++;
      }
      if (centerCount) {
        center.x /= centerCount;
        center.y /= centerCount;
      }
      let stubDrawn = 0;
      const stubGroups = new Map();
      for (let i = 0; i < cross.length; i++) {
        const e = cross[i];
        const pa = g.points.get(e.a);
        const pb = g.points.get(e.b);
        if (!pa || !pb) continue;
        let local = null;
        let other = null;
        if (pa.floor === ent.id) {
          local = pa;
          other = pb;
        } else if (pb.floor === ent.id) {
          local = pb;
          other = pa;
        }
        if (!local || !other) continue;
        let arr = stubGroups.get(local.id);
        if (!arr) {
          arr = [];
          stubGroups.set(local.id, arr);
        }
        arr.push({ e: e, local: local, other: other });
      }
      for (const items of stubGroups.values()) {
        const local = items[0].local;
        const step = Math.min(0.38, 1.4 / Math.max(1, items.length));
        for (let k = 0; k < items.length; k++) {
          if (stubDrawn >= 3000) break;
          const item = items[k];
          const selected = app.sel.has('e:' + item.e.id);
          const hovered = app.hover && app.hover.type === 'edge' && app.hover.id === item.e.id;
          if (ent.primary) {
            const offset = items.length > 1 ? (k - (items.length - 1) / 2) * step : 0;
            drawStub2D(ctx, scene, app, item.e, local, item.other, selected, hovered, center, offset);
            stubDrawn++;
          }
        }
      }

      /* edges */
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const a = g.points.get(e.a);
        const b = g.points.get(e.b);
        if (!a || !b) continue;
        const aS = scene.project(a.x, a.y, 0);
        const bS = scene.project(b.x, b.y, 0);
        aS.y += yOff;
        bS.y += yOff;
        const m = 60;
        if (
          (aS.x < -m && bS.x < -m) ||
          (aS.x > scene.W + m && bS.x > scene.W + m) ||
          (aS.y < -m && bS.y < -m) ||
          (aS.y > scene.H + m && bS.y > scene.H + m)
        ) {
          continue;
        }
        const selected = app.sel.has('e:' + e.id);
        const hovered = app.hover && app.hover.type === 'edge' && app.hover.id === e.id;
        if (ent.primary) {
          scene.showEdgeLabels = scene.showEdgeLabels;
        }
        drawEdge2D(
          ctx,
          scene,
          app,
          e,
          aS,
          bS,
          scene.nodeRadius * scale,
          scene.nodeRadius * scale,
          selected,
          hovered
        );
      }

      /* nodes */
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const s = scene.project(p.x, p.y, 0);
        const sx = s.x;
        const sy = s.y + yOff;
        const r = scene.nodeRadius * scale;
        if (sx < -r - 80 || sx > scene.W + r + 80 || sy < -r - 80 || sy > scene.H + r + 80) continue;
        drawNode2D(ctx, scene, app, p, sx, sy, r);
      }
      ctx.globalAlpha = 1;
    }

    const primary = floors.find(function (f) {
      return f.primary && f.alpha > 0.5;
    });
    if (primary && g.floors.has(primary.id)) {
      drawFloorBadge2D(ctx, scene, app, primary.id);
    }
  }

  /* ------------------------------------------------------------------ *
   * 3D drawing
   * ------------------------------------------------------------------ */

  function contentBounds3D(scene, app) {
    const g = app.graph;
    const idx = g.getIndex();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let count = 0;
    for (let i = 0; i < idx.floors.length; i++) {
      const f = idx.floors[i];
      if (!scene.visibleFloors.has(f.id)) continue;
      const z = scene.floorZ.get(f.id);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      const pts = idx.byFloor.get(f.id) || [];
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j];
        count++;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!count) {
      minX = -180;
      maxX = 180;
      minY = -180;
      maxY = 180;
    }
    if (!isFinite(minZ)) {
      minZ = 0;
      maxZ = 0;
    }
    const pad = 110;
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minY: minY - pad,
      maxY: maxY + pad,
      minZ: minZ,
      maxZ: maxZ,
      empty: !count,
    };
  }

  function drawPlane3D(ctx, scene, b, z, active, includeGrid, lite, color) {
    const p1 = scene.project(b.minX, b.minY, z);
    const p2 = scene.project(b.maxX, b.minY, z);
    const p3 = scene.project(b.maxX, b.maxY, z);
    const p4 = scene.project(b.minX, b.maxY, z);
    if (!p1 || !p2 || !p3 || !p4) return;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    if (!lite || active) {
      ctx.fillStyle = U.rgba(color, active ? 0.16 : 0.055);
      ctx.fill();
    }
    ctx.strokeStyle = U.rgba(color, active ? 0.85 : 0.32);
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();

    if (includeGrid) {
      const n = 4;
      ctx.strokeStyle = U.rgba(color, active ? 0.16 : 0.1);
      ctx.lineWidth = 1;
      for (let i = 1; i < n; i++) {
        const fx = b.minX + ((b.maxX - b.minX) * i) / n;
        const fy = b.minY + ((b.maxY - b.minY) * i) / n;
        const a1 = scene.project(fx, b.minY, z);
        const a2 = scene.project(fx, b.maxY, z);
        if (a1 && a2) {
          ctx.beginPath();
          ctx.moveTo(a1.x, a1.y);
          ctx.lineTo(a2.x, a2.y);
          ctx.stroke();
        }
        const b1 = scene.project(b.minX, fy, z);
        const b2 = scene.project(b.maxX, fy, z);
        if (b1 && b2) {
          ctx.beginPath();
          ctx.moveTo(b1.x, b1.y);
          ctx.lineTo(b2.x, b2.y);
          ctx.stroke();
        }
      }
    }
  }

  function draw3D(app, ctx, scene, view, opts) {
    const g = app.graph;
    const idx = g.getIndex();
    const b = contentBounds3D(scene, app);
    const includeGrid = opts.includeGrid != null ? opts.includeGrid : view.showGrid;

    /* planes, far to near */
    const planes = [];
    for (let i = 0; i < idx.floors.length; i++) {
      const f = idx.floors[i];
      if (!scene.visibleFloors.has(f.id)) continue;
      const z = scene.floorZ.get(f.id);
      const c = scene.project((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, z);
      if (!c) continue;
      planes.push({ f: f, z: z, depth: c.depth });
    }
    planes.sort(function (a, c) {
      return c.depth - a.depth;
    });
    const planeCount = planes.length;
    const litePlanes = planeCount > 260;
    for (let i = 0; i < planeCount; i++) {
      const pl = planes[i];
      drawPlane3D(
        ctx,
        scene,
        b,
        pl.z,
        pl.f.id === scene.currentFloor,
        !litePlanes && includeGrid && idx.floors.length <= 200,
        litePlanes,
        pl.f.color || U.DEFAULT_LAYER_COLOR
      );
    }

    /* floor labels (stride-limited for very deep stacks) */
    const labelStride = Math.max(1, Math.ceil(planeCount / 200));
    for (let i = 0; i < planeCount; i++) {
      const pl = planes[i];
      if (i % labelStride !== 0 && pl.f.id !== scene.currentFloor) continue;
      const s = scene.project(b.minX - 18, b.minY + 8, pl.z);
      if (!s) continue;
      const active = pl.f.id === scene.currentFloor;
      const desc = pl.f.desc ? ' · ' + U.truncate(pl.f.desc, 12) : '';
      const text = '层 ' + g.floorDisp(pl.f.id) + desc + (pl.f.visible ? '' : ' · 隐藏');
      const color = pl.f.color || U.DEFAULT_LAYER_COLOR;
      const lx = U.clamp(s.x - 24, 54, scene.W - 54);
      const ly = U.clamp(s.y, 24, scene.H - 24);
      const badge = drawPill(ctx, text, lx, ly, {
        fontSize: 11,
        color: active ? '#1e293b' : THEME.muted,
        bg: active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.82)',
        stroke: U.rgba(color, active ? 0.9 : 0.45),
        padX: 7,
        padY: 3,
      });
      scene.floorBadges.push({ id: pl.f.id, x: badge.x, y: badge.y, w: badge.w, h: badge.h });
    }

    /* edges */
    const edges = [];
    const collect = idx.edges.length <= 20000;
    const labelsOk =
      scene.orbit.dist < 1400 ? idx.edges.length <= 1200 : idx.edges.length <= 120;
    for (let i = 0; i < idx.edges.length; i++) {
      const e = idx.edges[i];
      const a = g.points.get(e.a);
      const bpt = g.points.get(e.b);
      if (!a || !bpt) continue;
      if (!scene.visibleFloors.has(a.floor) || !scene.visibleFloors.has(bpt.floor)) continue;
      const za = scene.floorZ.get(a.floor);
      const zb = scene.floorZ.get(bpt.floor);
      const pa = scene.project(a.x, a.y, za);
      const pb = scene.project(bpt.x, bpt.y, zb);
      if (!pa || !pb) continue;
      const item = { e: e, a: pa, b: pb, depth: (pa.depth + pb.depth) / 2 };
      if (collect) edges.push(item);
      else drawEdge3D(ctx, scene, app, item, labelsOk);
    }
    if (collect) {
      edges.sort(function (x, y) {
        return y.depth - x.depth;
      });
      for (let i = 0; i < edges.length; i++) drawEdge3D(ctx, scene, app, edges[i], labelsOk);
    }

    /* nodes */
    const nodes = [];
    for (let i = 0; i < idx.points.length; i++) {
      const p = idx.points[i];
      if (!scene.visibleFloors.has(p.floor)) continue;
      const s = scene.project(p.x, p.y, scene.floorZ.get(p.floor));
      if (!s) continue;
      const r = scene.nodeRadius * s.scale;
      if (r < 0.6) continue;
      if (s.x < -r - 80 || s.x > scene.W + r + 80 || s.y < -r - 80 || s.y > scene.H + r + 80) continue;
      nodes.push({ p: p, s: s, r: r });
    }
    nodes.sort(function (x, y) {
      return y.s.depth - x.s.depth;
    });
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      drawNodeScreen(ctx, scene, app, n.p, n.s.x, n.s.y, n.r);
    }
  }

  function drawEdge3D(ctx, scene, app, item, labelsOk) {
    const e = item.e;
    const aS = item.a;
    const bS = item.b;
    const selected = app.sel.has('e:' + e.id);
    const hovered = app.hover && app.hover.type === 'edge' && app.hover.id === e.id;
    const color = hovered ? THEME.hover : selected ? THEME.accent : e.color || THEME.edge;
    const baseW = scene.edgeWidth;
    if (e.a === e.b) {
      const r = Math.max(2, scene.nodeRadius * aS.scale);
      ctx.beginPath();
      ctx.arc(aS.x, aS.y - r * 1.25, r * 0.92, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = edgeStrokeWidth(baseW, selected, hovered);
      ctx.stroke();
      if (e.directed) {
        const cy = aS.y - r * 1.25;
        const rr = r * 0.92;
        const ang = -Math.PI / 4;
        const ax = aS.x + Math.cos(ang) * rr;
        const ay = cy + Math.sin(ang) * rr;
        drawArrow(
          ctx,
          ax,
          ay,
          ang + Math.PI / 2,
          Math.max(baseW * 1.2, Math.min(80, rr * 0.35 * (0.7 + baseW / 10))),
          color
        );
      }
      if (labelsOk && scene.orbit.dist < 9000) {
        const label = edgeLabel(e);
        if (label) {
          drawPill(ctx, label, aS.x, aS.y - r * 2.17 - 10, {
            fontSize: 9,
            color: selected ? THEME.accent : THEME.muted,
            padX: 4,
            padY: 1.5,
            bg: 'rgba(255,255,255,0.78)',
          });
        }
      }
      return;
    }
    const rA = scene.nodeRadius * aS.scale;
    const rB = scene.nodeRadius * bS.scale;
    let dx = bS.x - aS.x;
    let dy = bS.y - aS.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d;
    const uy = dy / d;
    const arrowGap = Math.max(0, 5 - (baseW - 2) * 0.5);
    const x1 = aS.x + ux * Math.min(rA + 1, d * 0.4);
    const y1 = aS.y + uy * Math.min(rA + 1, d * 0.4);
    const x2 = bS.x - ux * Math.min(rB + arrowGap, d * 0.4);
    const y2 = bS.y - uy * Math.min(rB + arrowGap, d * 0.4);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = edgeStrokeWidth(baseW, selected, hovered);
    ctx.stroke();
    if (e.directed) drawArrow(ctx, x2, y2, Math.atan2(dy, dx), edgeArrowSize(baseW, ((rA + rB) / 2) / 18), color);
    if (labelsOk && scene.orbit.dist < 9000 && d > 40) {
      const label = edgeLabel(e);
      if (label) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        drawPill(ctx, label, mx, my, {
          fontSize: 9,
          color: selected ? THEME.accent : THEME.muted,
          padX: 4,
          padY: 1.5,
          bg: 'rgba(255,255,255,0.78)',
        });
      }
    }
  }

  function drawNodeScreen(ctx, scene, app, p, sx, sy, r) {
    const g = app.graph;
    const selected = app.sel.has('p:' + p.id);
    const hovered = app.hover && app.hover.type === 'point' && app.hover.id === p.id;
    const fill = p.color || '#000000';
    if (selected) {
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.18, 0, Math.PI * 2);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.stroke();
    }
    if (hovered) {
      ctx.beginPath();
      ctx.arc(sx, sy, r * 1.26, 0, Math.PI * 2);
      ctx.strokeStyle = THEME.hover;
      ctx.lineWidth = Math.max(1.5, r * 0.06);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = U.luminance(fill) > 0.8 ? '#cbd5e1' : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    scene.nodeHits.push({ id: p.id, x: sx, y: sy, r: Math.max(r + 4, 6) });

    if (r >= 6) {
      const idText = String(g.pointDisp(p.id));
      const fs = Math.min(26, Math.max(6, r * 0.58));
      ctx.font = font(fs, 600);
      const tw = ctx.measureText(idText).width;
      const shrink = Math.min(1, (r * 1.5) / Math.max(1, tw));
      ctx.font = font(Math.max(5.5, fs * shrink), 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = U.contrastText(fill);
      const hasWeight = p.weight != null && r >= 9;
      ctx.fillText(idText, sx, sy + (hasWeight ? -r * 0.16 : 0));
      if (hasWeight) {
        ctx.font = font(Math.max(5.5, Math.min(17, r * 0.32)), 500);
        ctx.fillStyle = U.contrastText(fill);
        ctx.globalAlpha = 0.92;
        ctx.fillText(U.weightText(p.weight), sx, sy + r * 0.46);
        ctx.globalAlpha = 1;
      }
    }
    if (r >= 11 && p.desc) {
      const df = Math.min(14, Math.max(8, r * 0.3));
      haloText(ctx, U.truncate(p.desc, 5), sx, sy + r + df * 0.9, THEME.muted, df, 500);
    }
  }

  /* ------------------------------------------------------------------ *
   * Fit / spacing helpers
   * ------------------------------------------------------------------ */

  function fit2D(bounds, W, H, padding, maxScale) {
    const pad = padding == null ? 80 : padding;
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    const cap = maxScale == null ? 2.2 : maxScale;
    const scale = U.clamp(Math.min((W - pad * 2) / bw, (H - pad * 2) / bh), 0.02, cap);
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
      scale: scale,
    };
  }

  function computeSpacing(floors, maxPerFloor) {
    if (floors <= 1) return 0;
    const fit = 3200 / (floors - 1);
    const density = 150 + Math.min(130, Math.sqrt(maxPerFloor || 1) * 6);
    return U.clamp(Math.min(density, fit), 34, 340);
  }

  function targetSpacing(graph) {
    const idx = graph.getIndex();
    let maxPerFloor = 0;
    for (let i = 0; i < idx.floors.length; i++) {
      const arr = idx.byFloor.get(idx.floors[i].id);
      if (arr && arr.length > maxPerFloor) maxPerFloor = arr.length;
    }
    return computeSpacing(idx.floors.length, maxPerFloor);
  }

  function fitView(app, W, H, opts) {
    opts = opts || {};
    const view = opts.view || app.view;
    const g = app.graph;
    const idx = g.getIndex();
    if (!idx.floors.length) return;
    if (view.mode === '2d') {
      const fid = idx.floors.some(function (f) {
        return f.id === view.currentFloor;
      })
        ? view.currentFloor
        : idx.floors[0].id;
      view.currentFloor = fid;
      const pts = (idx.byFloor.get(fid) || []).filter(function (p) {
        return p.x != null;
      });
      const b = GE.Layout.bounds(pts);
      view.cam = fit2D(b, W, H, opts.padding == null ? 90 : opts.padding, opts.maxScale);
      view.fitTween = null;
    } else {
      const includeHidden = !!opts.includeHidden;
      const visibleFloors = new Set();
      for (let i = 0; i < idx.floors.length; i++) {
        if (includeHidden || idx.floors[i].visible) visibleFloors.add(idx.floors[i].id);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let count = 0;
      for (let i = 0; i < idx.points.length; i++) {
        const p = idx.points[i];
        if (!visibleFloors.has(p.floor) || p.x == null) continue;
        count++;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (!count) {
        minX = -200;
        maxX = 200;
        minY = -200;
        maxY = 200;
      }
      const zSpan = Math.max(0, (idx.floors.length - 1) * view.spacing);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const radius = Math.max(140, 0.5 * Math.hypot(maxX - minX, maxY - minY, zSpan));
      view.orbit.tx = cx;
      view.orbit.ty = cy;
      view.orbit.tz = 0;
      view.orbit.dist = U.clamp((radius / Math.sin(FOV / 2)) * 1.12, 260, 90000);
    }
  }

  /* ------------------------------------------------------------------ *
   * Entry point
   * ------------------------------------------------------------------ */

  function draw(app, ctx, W, H, opts) {
    opts = opts || {};
    const view = opts.view || app.view;
    const exporting = !!opts.exporting;
    const dpr = opts.dpr || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!opts.transparent) {
      ctx.fillStyle = opts.background || THEME.bg;
      ctx.fillRect(0, 0, W, H);
    }
    const scene =
      view.mode === '3d' ? make3DScene(app, W, H, view, opts) : make2DScene(app, W, H, view);
    if (view.mode === '3d') {
      draw3D(app, ctx, scene, view, opts);
    } else {
      if (opts.includeGrid != null ? opts.includeGrid : view.showGrid) drawGrid2D(ctx, scene);
      draw2D(app, ctx, scene, view, opts);
    }
    if (!exporting) {
      if (app.boxSelect) {
        const r = app.boxSelect;
        const x = Math.min(r.x0, r.x1);
        const y = Math.min(r.y0, r.y1);
        const w = Math.abs(r.x1 - r.x0);
        const h = Math.abs(r.y1 - r.y0);
        ctx.fillStyle = 'rgba(79,70,229,0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(79,70,229,0.75)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.setLineDash([]);
      }
      app.pick = scene;
    }
    ctx.restore();
  }

  GE.Render = {
    draw: draw,
    fitView: fitView,
    fit2D: fit2D,
    computeSpacing: computeSpacing,
    targetSpacing: targetSpacing,
    gridStep: gridStep,
    THEME: THEME,
    NODE_R: NODE_R,
    FOV: FOV,
  };
})(globalThis.GE = globalThis.GE || {});
