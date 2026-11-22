/* Graph Editor - application state, actions and main loop */
(function (GE) {
  'use strict';

  const U = GE.U;
  const SAVE_KEY = 'graph-editor:autosave:v1';
  const MAX_SAVE_EDGES = 200000;

  const App = {
    graph: null,
    history: null,
    sim: null,
    simParams: null,
    lastEdgeDirected: false,
    view: null,
    sel: new Set(),
    hover: null,
    boxSelect: null,
    clipboard: null,
    W: 900,
    H: 640,
    dpr: 1,
    canvas: null,
    ctx: null,
    fps: 60,
    _frames: 0,
    _fpsTime: 0,
    _last: 0,
    _acc: 0,
    _lastParsedText: '',
    _textDirty: false,
    _save: null,
    _textDebounce: null,
    textError: null,

    init: function () {
      this.history = new GE.History(300);
      this.history.onChange = this.updateToolbar.bind(this);
      this.graph = GE.emptyGraph({ pointStart: 1, floorStart: 1 });
      this.simParams = Object.assign({}, GE.Layout.DEFAULT_PARAMS);
      this.sim = new GE.Layout.Sim(this.graph, this.simParams);
      this.view = {
        mode: '2d',
        cam: { x: 0, y: 0, scale: 1 },
        orbit: { yaw: -0.62, pitch: 0.46, dist: 1900, tx: 0, ty: 0, tz: 0 },
        spacing: 200,
        spacingTarget: 200,
        edgeWidth: U.EDGE_WIDTH.DEFAULT,
        nodeRadius: U.NODE_RADIUS.DEFAULT,
        spacingScale: U.SPACING_SCALE.DEFAULT,
        currentFloor: this.graph.firstFloorId(),
        transition: null,
        physics: true,
        showGrid: true,
        camTween: null,
        orbitTween: null,
      };
      this.canvas = document.getElementById('canvas');
      this.ctx = this.canvas.getContext('2d');
      GE.UI.init(this);
      this.restore();
      this.ensureFloors();
      this.ensureCurrentFloor();
      GE.Layout.seed(this.graph);
      // Make the force simulation active from the very first frame. Without
      // this, alpha stays 0 and a restored graph appears completely static.
      this.sim.reheat(1);
      if (this.view.physics) this.settleForFit();
      this.updateSpacingTarget();
      this.view.spacing = this.view.spacingTarget;
      this.resize();
      this.fit(false);
      this.syncText(true);
      this.refreshAll();
      this._save = U.debounce(this.writeSave.bind(this), 900);
      this._textDebounce = U.debounce(this.parseText.bind(this, false), 170);
      this._loop = this.loop.bind(this);
      this._last = 0;
      this._acc = 0;
      window.addEventListener('beforeunload', () => {
        try {
          this.writeSave();
        } catch (err) {
          /* ignore */
        }
      });
      requestAnimationFrame(this._loop);
    },

    /* ------------------------------------------------------------ *
     * infrastructure
     * ------------------------------------------------------------ */

    resize: function () {
      const stage = document.getElementById('stage');
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      this.W = Math.max(120, Math.round(rect.width));
      this.H = Math.max(120, Math.round(rect.height));
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
    },

    loop: function (now) {
      if (!this._last) this._last = now;
      const dt = Math.min(64, now - this._last);
      this._last = now;
      this._acc = Math.min(80, this._acc + dt);
      const active = this.view.physics && this.sim.alpha > 0;
      let steps = 0;
      while (this._acc >= 16.67 && steps < 3) {
        this._acc -= 16.67;
        steps++;
        if (active) this.sim.step();
      }
      if (!this.view.physics) this.sim.alpha = 0;
      this.updateCamera(dt);
      this.render();
      this._frames++;
      this._fpsTime += dt;
      if (this._fpsTime >= 500) {
        this.fps = Math.round((this._frames * 1000) / this._fpsTime);
        this._frames = 0;
        this._fpsTime = 0;
        GE.UI.updateHud(this);
      }
      requestAnimationFrame(this._loop);
    },

    render: function () {
      if (!this.ctx) return;
      GE.Render.draw(this, this.ctx, this.W, this.H, { dpr: this.dpr });
    },

    updateCamera: function (dt) {
      const v = this.view;
      const now = U.now();
      if (v.camTween) {
        const t = U.clamp((now - v.camTween.start) / v.camTween.dur, 0, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        v.cam.x = v.camTween.from.x + (v.camTween.to.x - v.camTween.from.x) * e;
        v.cam.y = v.camTween.from.y + (v.camTween.to.y - v.camTween.from.y) * e;
        v.cam.scale = v.camTween.from.scale + (v.camTween.to.scale - v.camTween.from.scale) * e;
        if (t >= 1) v.camTween = null;
      }
      if (v.orbitTween) {
        const t = U.clamp((now - v.orbitTween.start) / v.orbitTween.dur, 0, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const f = v.orbitTween.from;
        const to = v.orbitTween.to;
        if (to.tx != null) v.orbit.tx = f.tx + (to.tx - f.tx) * e;
        if (to.ty != null) v.orbit.ty = f.ty + (to.ty - f.ty) * e;
        if (to.tz != null) v.orbit.tz = f.tz + (to.tz - f.tz) * e;
        if (to.dist != null) v.orbit.dist = f.dist + (to.dist - f.dist) * e;
        if (to.yaw != null) v.orbit.yaw = f.yaw + (to.yaw - f.yaw) * e;
        if (to.pitch != null) v.orbit.pitch = f.pitch + (to.pitch - f.pitch) * e;
        if (t >= 1) v.orbitTween = null;
      }
      if (Math.abs(v.spacing - v.spacingTarget) > 0.4) {
        v.spacing += (v.spacingTarget - v.spacing) * Math.min(1, dt / 110);
      } else {
        v.spacing = v.spacingTarget;
      }
    },

    /* ------------------------------------------------------------ *
     * model plumbing
     * ------------------------------------------------------------ */

    transaction: function (label, fn, opts) {
      opts = opts || {};
      const m = new GE.Mutator(this.graph, label, { coalesceKey: opts.coalesceKey });
      let failed = false;
      try {
        fn(m);
      } catch (err) {
        console.error(err);
        failed = true;
        this.toast('操作失败：' + (err && err.message ? err.message : err), 'error');
      }
      if (failed) {
        this.refreshAll();
        return false;
      }
      const cmd = m.toCommand();
      if (!cmd) {
        this.refreshAll();
        return false;
      }
      this.history.push(cmd);
      this.afterModelChange(opts);
      return true;
    },

    afterModelChange: function (opts) {
      opts = opts || {};
      this.sim.graph = this.graph;
      if (opts.reheat !== 0) this.sim.reheat(opts.reheat == null ? 0.75 : opts.reheat);
      this.updateSpacingTarget();
      this.ensureFloors();
      this.ensureCurrentFloor();
      this.pruneSelection();
      this.refreshAll();
      if (!opts.noText) this.syncText();
      if (this._save) this._save();
    },

    ensureFloors: function () {
      if (this.graph.floors.size === 0) {
        this.graph.insertFloor({ id: this.graph.allocFloorId(), visible: true, desc: '' });
        this.graph.bump();
      }
    },

    ensureCurrentFloor: function () {
      if (!this.graph.floors.has(this.view.currentFloor)) {
        this.view.currentFloor = this.graph.firstFloorId();
        this.view.transition = null;
      }
    },

    pruneSelection: function () {
      const g = this.graph;
      const next = new Set();
      for (const key of this.sel) {
        const info = U.keyInfo(key);
        if (info.type === 'p' && g.points.has(info.id)) next.add(key);
        else if (info.type === 'e' && g.edges.has(info.id)) next.add(key);
        else if (info.type === 'f' && g.floors.has(info.id)) next.add(key);
      }
      this.sel = next;
    },

    remapSelection: function (oldGraph, newGraph) {
      const next = new Set();
      for (const key of this.sel) {
        const info = U.keyInfo(key);
        if (info.type === 'p') {
          const p = oldGraph.points.get(info.id);
          if (!p) continue;
          const id = newGraph.pointIdFromDisp(oldGraph.pointDisp(p.id));
          if (id >= 0) next.add('p:' + id);
        } else if (info.type === 'f') {
          const f = oldGraph.floors.get(info.id);
          if (!f) continue;
          const id = newGraph.floorIdFromDisp(oldGraph.floorDisp(f.id));
          if (id >= 0) next.add('f:' + id);
        }
      }
      this.sel = next;
    },

    refreshAll: function () {
      GE.UI.refresh(this);
      GE.UI.updateHud(this);
      this.updateToolbar();
    },

    updateSpacingTarget: function () {
      this.view.spacingTarget = GE.Render.targetSpacing(this.graph) * (this.view.spacingScale || 1);
    },

    updateToolbar: function () {
      GE.UI.updateToolbar(this);
    },

    selectionChanged: function () {
      GE.UI.refreshSelection(this);
      GE.UI.updateHud(this);
    },

    toast: function (message, kind) {
      GE.UI.toast(message, kind);
    },

    /* ------------------------------------------------------------ *
     * text document sync
     * ------------------------------------------------------------ */

    syncText: function (force) {
      if (!GE.UI.textArea) return;
      if (!force && document.activeElement === GE.UI.textArea) return;
      if (this.graph.edges.size > 200000) {
        GE.UI.showTextHint('图过大（超过 20 万条边），已暂停自动生成文本。可手动点击“用模型重写”。');
        return;
      }
      const txt = GE.Parser.serialize(this.graph);
      GE.UI.setText(txt);
      GE.UI.clearTextNotice();
      this._lastParsedText = txt;
      this._textDirty = false;
      this.textError = null;
    },

    onTextInput: function () {
      this._textDirty = true;
      GE.UI.showTextHint('输入中…');
      this._textDebounce();
    },

    onTextBlur: function () {
      if (this._textDebounce) this._textDebounce.cancel();
      this.parseText(true);
    },

    parseText: function (final) {
      if (!GE.UI.textArea) return;
      const txt = GE.UI.getText();
      if (!final && txt === this._lastParsedText) return;
      const res = GE.Parser.parse(txt, { existing: this.graph, final: !!final });
      if (!res.ok) {
        if (res.error) {
          this.textError = res.error;
          GE.UI.showTextError(res.error);
        } else {
          GE.UI.showTextHint('输入中…');
        }
        return;
      }
      this.textError = null;
      if (res.incomplete) GE.UI.showTextHint('输入中…');
      else GE.UI.clearTextNotice();
      if (txt === this._lastParsedText) return;
      const before = this.graph;
      const next = res.graph;
      GE.Layout.seed(next);
      this._lastParsedText = txt;
      this._textDirty = true;
      this.history.push(GE.replaceCommand('编辑文本', before, next, 'text-edit'));
      this.graph = next;
      this.remapSelection(before, next);
      this.afterModelChange({ noText: true, reheat: 0.45 });
    },

    rewriteTextFromModel: function () {
      this.syncText(true);
      this.toast('已根据当前模型重写文本');
    },

    downloadText: function () {
      const txt = GE.Parser.serialize(this.graph);
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      U.download(blob, 'graph-' + U.timestamp() + '.txt');
    },

    importTextFile: function (file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const txt = String(reader.result || '');
        GE.UI.setText(txt);
        this._lastParsedText = '';
        this.parseText(true);
        this.fit(false);
        this.toast('已导入文本文件');
      };
      reader.onerror = () => this.toast('读取文件失败', 'error');
      reader.readAsText(file, 'utf-8');
    },

    /* ------------------------------------------------------------ *
     * editing actions
     * ------------------------------------------------------------ */

    newPoint: function () {
      if (this.graph.points.size >= GE.LIMITS.points) {
        this.toast('节点数已达上限 ' + GE.LIMITS.points, 'error');
        return;
      }
      const fid = this.view.currentFloor;
      const floor = this.graph.floors.get(fid);
      const color = floor && floor.color ? floor.color : U.DEFAULT_LAYER_COLOR;
      const center = this.worldCenter();
      const ang = Math.random() * Math.PI * 2;
      const rad = 30 + Math.random() * 70;
      const x = center.x + Math.cos(ang) * rad;
      const y = center.y + Math.sin(ang) * rad;
      let created = null;
      this.transaction('新建节点', (m) => {
        const p = m.addPoint({ floor: fid, x: x, y: y, color: color });
        created = p;
        this.sel = new Set(['p:' + p.id]);
      });
      if (created) this.toast('已新建节点 #' + this.graph.pointDisp(created.id));
    },

    settleForFit: function () {
      const n = this.graph.points.size;
      if (!n || n > 400) return;
      this.sim.graph = this.graph;
      this.sim.alpha = 1;
      const steps = n <= 120 ? 160 : 70;
      for (let i = 0; i < steps; i++) this.sim.step();
    },

    newEdge: function (spec) {
      if (this.graph.edges.size >= GE.LIMITS.edges) {
        this.toast('边数已达上限 ' + GE.LIMITS.edges, 'error');
        return false;
      }
      const ok = this.transaction('新建边', (m) => {
        const e = m.addEdge(spec);
        this.sel = new Set(['e:' + e.id]);
      });
      if (ok) {
        this.lastEdgeDirected = !!spec.directed;
        this.toast('已新建' + (spec.directed ? '有向' : '无向') + '边');
        this.sim.reheat(1);
        // The transaction already scheduled an autosave with the previous
        // direction; schedule again so the new choice survives a reload.
        if (this._save) this._save();
      }
      return ok;
    },

    newFloor: function () {
      if (this.graph.floors.size >= GE.LIMITS.floors) {
        this.toast('层数已达上限 ' + GE.LIMITS.floors, 'error');
        return;
      }
      const prev = this.view.currentFloor;
      this.transaction('新建分层', (m) => {
        const f = m.addFloor({});
        this.view.currentFloor = f.id;
        if (this.view.mode === '2d') {
          this.view.transition = { from: prev, to: f.id, start: U.now(), dur: 240 };
        }
        this.sel = new Set(['f:' + f.id]);
      });
      this.toast('已新建第 ' + this.graph.floorDisp(this.view.currentFloor) + ' 层');
    },

    setNumbering: function (kind, value) {
      const current = kind === 'point' ? this.graph.settings.pointStart : this.graph.settings.floorStart;
      if (current === value) return;
      const label = kind === 'point' ? '切换点编号起点' : '切换层编号起点';
      const patch = kind === 'point' ? { pointStart: value } : { floorStart: value };
      this.transaction(label, (m) => m.setSettings(patch));
      this.toast((kind === 'point' ? '点' : '层') + '编号已切换为 ' + value + ' 起点');
    },

    toggleFloorVisibility: function (fid) {
      const f = this.graph.floors.get(fid);
      if (!f) return;
      this.transaction(f.visible ? '隐藏层' : '显示层', (m) => m.updateFloor(fid, { visible: !f.visible }));
    },

    setCurrentFloor: function (fid, animate) {
      if (!this.graph.floors.has(fid)) return;
      const prev = this.view.currentFloor;
      if (prev === fid) return;
      this.view.currentFloor = fid;
      if (this.view.mode === '2d' && animate !== false) {
        this.view.transition = { from: prev, to: fid, start: U.now(), dur: 240 };
      }
      if (this.view.mode === '3d' && animate !== false) {
        const idx = this.graph.getIndex();
        const rank = idx.floors.findIndex((f) => f.id === fid);
        const z = (rank - (idx.floors.length - 1) / 2) * this.view.spacing;
        this.view.orbitTween = {
          from: Object.assign({}, this.view.orbit),
          to: Object.assign({}, this.view.orbit, { tz: z }),
          start: U.now(),
          dur: 260,
        };
      }
      this.refreshAll();
      if (this._save) this._save();
    },

    stepFloor: function (dir) {
      const idx = this.graph.getIndex();
      if (idx.floors.length <= 1) return;
      let rank = idx.floors.findIndex((f) => f.id === this.view.currentFloor);
      if (rank < 0) rank = 0;
      const next = U.clamp(rank + dir, 0, idx.floors.length - 1);
      this.setCurrentFloor(idx.floors[next].id, true);
    },

    selectAll: function () {
      const idx = this.graph.getIndex();
      const sel = new Set();
      const floorIds = new Set();
      if (this.view.mode === '3d') {
        for (const f of idx.floors) if (f.visible) floorIds.add(f.id);
      } else {
        floorIds.add(this.view.currentFloor);
      }
      const pointIds = new Set();
      for (const p of idx.points) {
        if (!floorIds.has(p.floor)) continue;
        sel.add('p:' + p.id);
        pointIds.add(p.id);
      }
      for (const e of idx.edges) {
        if (pointIds.has(e.a) && pointIds.has(e.b)) sel.add('e:' + e.id);
      }
      this.sel = sel;
      this.selectionChanged();
      this.toast('已选中 ' + pointIds.size + ' 个节点');
    },

    copySelection: function () {
      const g = this.graph;
      const ids = [];
      for (const key of this.sel) {
        const info = U.keyInfo(key);
        if (info.type === 'p' && g.points.has(info.id)) ids.push(info.id);
      }
      if (!ids.length) {
        this.toast('请先选中节点（复制以节点及其内部边为单位）', 'error');
        return false;
      }
      const index = new Map();
      const points = [];
      for (let i = 0; i < ids.length; i++) {
        const p = g.points.get(ids[i]);
        index.set(p.id, i);
        points.push({
          floorDisp: g.floorDisp(p.floor),
          weight: Array.isArray(p.weight) ? p.weight.slice() : p.weight,
          color: p.color,
          desc: p.desc,
          x: p.x,
          y: p.y,
        });
      }
      const edges = [];
      for (const e of g.edges.values()) {
        if (index.has(e.a) && index.has(e.b)) {
          edges.push({
            a: index.get(e.a),
            b: index.get(e.b),
            directed: e.directed,
            weight: Array.isArray(e.weight) ? e.weight.slice() : e.weight,
            color: e.color,
            desc: e.desc,
          });
        }
      }
      this.clipboard = { points: points, edges: edges };
      this.toast('已复制 ' + points.length + ' 个节点，' + edges.length + ' 条边');
      return true;
    },

    cutSelection: function () {
      if (!this.copySelection()) return;
      this.deleteSelection({ skipConfirm: true, silent: true });
      this.toast('已剪切选中内容');
    },

    pasteSelection: function () {
      if (!this.clipboard || !this.clipboard.points.length) {
        this.toast('剪贴板为空', 'error');
        return;
      }
      if (this.graph.points.size + this.clipboard.points.length > GE.LIMITS.points) {
        this.toast('粘贴后节点数将超过上限 ' + GE.LIMITS.points, 'error');
        return;
      }
      if (this.graph.edges.size + this.clipboard.edges.length > GE.LIMITS.edges) {
        this.toast('粘贴后边数将超过上限 ' + GE.LIMITS.edges, 'error');
        return;
      }
      const clip = this.clipboard;
      const offset = 40;
      const fallbackFloor = this.view.currentFloor;
      const sel = new Set();
      this.transaction('粘贴', (m) => {
        const newIds = [];
        for (let i = 0; i < clip.points.length; i++) {
          const cp = clip.points[i];
          let fid = this.graph.floorIdFromDisp(cp.floorDisp);
          if (fid < 0) fid = fallbackFloor;
          const p = m.addPoint({
            floor: fid,
            weight: Array.isArray(cp.weight) ? cp.weight.slice() : cp.weight,
            color: cp.color,
            desc: cp.desc,
            x: (cp.x == null ? 0 : cp.x) + offset,
            y: (cp.y == null ? 0 : cp.y) + offset,
          });
          newIds.push(p.id);
          sel.add('p:' + p.id);
        }
        for (let i = 0; i < clip.edges.length; i++) {
          const ce = clip.edges[i];
          const a = newIds[ce.a];
          const b = newIds[ce.b];
          if (a == null || b == null) continue;
          const e = m.addEdge({
            a: a,
            b: b,
            directed: ce.directed,
            weight: ce.weight,
            color: ce.color,
            desc: ce.desc,
          });
          sel.add('e:' + e.id);
        }
        this.sel = sel;
      });
      this.sim.reheat(0.8);
      this.toast('已粘贴到画布');
    },

    deleteSelection: function (opts) {
      opts = opts || {};
      if (!this.sel.size) {
        this.toast('没有选中的对象', 'error');
        return;
      }
      const g = this.graph;
      const info = this.selectionInfo();
      const deletingFloors = info.floors;
      if (deletingFloors.length >= g.floors.size) {
        this.toast('至少需要保留一层，无法删除全部层', 'error');
        return;
      }
      const pointIds = new Set(info.points.map((p) => p.id));
      for (const f of deletingFloors) {
        const arr = g.getIndex().byFloor.get(f.id) || [];
        for (const p of arr) pointIds.add(p.id);
      }
      const edgeIds = new Set(info.edges.map((e) => e.id));
      for (const pid of pointIds) {
        for (const eid of g.incidentEdges(pid)) edgeIds.add(eid);
      }
      const counts = { points: pointIds.size, edges: edgeIds.size, floors: deletingFloors.length };
      const finish = () => {
        this.transaction(
          '删除选中',
          (m) => {
            for (const eid of edgeIds) m.removeEdge(eid);
            for (const pid of pointIds) m.removePoint(pid);
            for (const f of deletingFloors) m.removeFloor(f.id);
            this.sel.clear();
          },
          { reheat: 0.4 }
        );
        this.toast('已删除 ' + counts.points + ' 个节点、' + counts.edges + ' 条边' + (counts.floors ? '、' + counts.floors + ' 个层' : ''));
      };
      if (opts.skipConfirm) {
        finish();
        return;
      }
      const parts = [];
      if (counts.points) parts.push(counts.points + ' 个节点');
      if (counts.edges) parts.push(counts.edges + ' 条边');
      if (counts.floors) parts.push(counts.floors + ' 个层（层内节点与相连边一并删除）');
      GE.UI.confirm({
        title: '确认删除',
        message: '将删除 ' + parts.join('、') + '。此操作可通过撤销恢复。',
        confirmLabel: '删除',
        danger: true,
      }).then((yes) => {
        if (yes) finish();
      });
    },

    editSelection: function () {
      if (!this.sel.size) {
        this.toast('请先选中对象', 'error');
        return;
      }
      GE.UI.openEditSelection(this);
    },

    commitPositions: function (before) {
      if (!before || !before.length) return;
      let moved = false;
      const m = new GE.Mutator(this.graph, '移动节点');
      for (let i = 0; i < before.length; i++) {
        const b = before[i];
        const p = this.graph.points.get(b.id);
        if (!p) continue;
        if (Math.abs(p.x - b.x) < 0.01 && Math.abs(p.y - b.y) < 0.01) continue;
        moved = true;
        m.updatePoint(b.id, { x: p.x, y: p.y, vx: 0, vy: 0 });
      }
      if (!moved) return;
      const cmd = m.toCommand();
      if (cmd) {
        this.history.push(cmd);
        this.refreshAll();
        if (this._save) this._save();
      }
    },

    /* ------------------------------------------------------------ *
     * history / view
     * ------------------------------------------------------------ */

    undo: function () {
      const res = this.history.undo(this.graph);
      if (!res) {
        this.toast('没有可撤销的操作');
        return;
      }
      this.applyHistoryGraph(res.graph);
      this.toast('已撤销：' + res.cmd.label);
    },

    redo: function () {
      const res = this.history.redo(this.graph);
      if (!res) {
        this.toast('没有可重做的操作');
        return;
      }
      this.applyHistoryGraph(res.graph);
      this.toast('已重做：' + res.cmd.label);
    },

    applyHistoryGraph: function (graph) {
      this.graph = graph;
      this.sim.graph = graph;
      this.sim.reheat(0.5);
      this.ensureFloors();
      this.ensureCurrentFloor();
      this.pruneSelection();
      this.updateSpacingTarget();
      this.refreshAll();
      this.syncText();
      if (this._save) this._save();
    },

    fit: function (animate) {
      const tmp = {
        mode: this.view.mode,
        cam: Object.assign({}, this.view.cam),
        orbit: Object.assign({}, this.view.orbit),
        currentFloor: this.view.currentFloor,
        spacing: this.view.spacingTarget,
      };
      GE.Render.fitView({ graph: this.graph, view: tmp }, this.W, this.H, {});
      if (this.view.mode === '2d' && tmp.currentFloor !== this.view.currentFloor) {
        this.view.currentFloor = tmp.currentFloor;
      }
      if (animate) {
        this.view.camTween = {
          from: Object.assign({}, this.view.cam),
          to: tmp.cam,
          start: U.now(),
          dur: 340,
        };
        this.view.orbitTween = {
          from: Object.assign({}, this.view.orbit),
          to: tmp.orbit,
          start: U.now(),
          dur: 340,
        };
      } else {
        this.view.cam = tmp.cam;
        this.view.orbit = tmp.orbit;
        this.view.camTween = null;
        this.view.orbitTween = null;
      }
    },

    resetView: function () {
      if (this.view.mode === '3d') {
        this.view.orbit.yaw = -0.62;
        this.view.orbit.pitch = 0.46;
      }
      this.fit(true);
      this.toast('视角已回正');
    },

    togglePhysics: function () {
      this.view.physics = !this.view.physics;
      if (this.view.physics) this.sim.reheat(0.6);
      this.toast('物理效果已' + (this.view.physics ? '开启' : '关闭'));
      this.refreshAll();
      if (this._save) this._save();
    },

    toggleGrid: function () {
      this.view.showGrid = !this.view.showGrid;
      this.toast('网格已' + (this.view.showGrid ? '显示' : '隐藏'));
      this.refreshAll();
      if (this._save) this._save();
    },

    resetPreferences: function () {
      this.view.edgeWidth = U.EDGE_WIDTH.DEFAULT;
      this.view.nodeRadius = U.NODE_RADIUS.DEFAULT;
      this.view.spacingScale = U.SPACING_SCALE.DEFAULT;
      this.simParams = Object.assign({}, GE.Layout.DEFAULT_PARAMS);
      this.sim.setParams(this.simParams);
      this.updateSpacingTarget();
      this.sim.reheat(0.5);
      GE.UI.refreshPreferences(this, true);
      if (this._save) this._save();
      this.toast('偏好已恢复默认');
    },

    setPreference: function (key, value) {
      if (key === 'edgeWidth') return this.setEdgeWidth(value);
      if (key === 'nodeRadius') return this.setNodeRadius(value);
      if (key === 'spacingScale') return this.setSpacingScale(value);
      return this.setSimParam(key, value);
    },

    setEdgeWidth: function (value) {
      const n = Number(value);
      if (!isFinite(n)) {
        GE.UI.refreshPreferences(this, true);
        return;
      }
      const next = U.clamp(n, U.EDGE_WIDTH.MIN, U.EDGE_WIDTH.MAX);
      if (Math.abs(next - this.view.edgeWidth) < 1e-6) return;
      this.view.edgeWidth = next;
      GE.UI.refreshPreferences(this, true);
      if (this._save) this._save();
    },

    setNodeRadius: function (value) {
      const n = Number(value);
      if (!isFinite(n)) {
        GE.UI.refreshPreferences(this, true);
        return;
      }
      const next = U.clamp(n, U.NODE_RADIUS.MIN, U.NODE_RADIUS.MAX);
      if (Math.abs(next - this.view.nodeRadius) < 1e-6) return;
      this.view.nodeRadius = next;
      GE.UI.refreshPreferences(this, true);
      if (this._save) this._save();
    },

    setSpacingScale: function (value) {
      const n = Number(value);
      if (!isFinite(n)) {
        GE.UI.refreshPreferences(this, true);
        return;
      }
      const next = U.clamp(n, U.SPACING_SCALE.MIN, U.SPACING_SCALE.MAX);
      if (Math.abs(next - this.view.spacingScale) < 1e-6) return;
      this.view.spacingScale = next;
      this.updateSpacingTarget();
      GE.UI.refreshPreferences(this, true);
      if (this._save) this._save();
    },

    setSimParam: function (key, value) {
      const range = GE.Layout.PARAM_RANGES[key];
      if (!range) return;
      const n = Number(value);
      if (!isFinite(n)) {
        GE.UI.refreshPreferences(this, true);
        return;
      }
      const next = U.clamp(n, range.min, range.max);
      if (Math.abs((this.simParams[key] || 0) - next) < 1e-9) return;
      this.simParams[key] = next;
      this.sim.setParams({ [key]: next });
      this.sim.reheat(0.5);
      GE.UI.refreshPreferences(this, true);
      if (this._save) this._save();
    },

    gatherNodes: function () {
      const idx = this.graph.getIndex();
      if (!idx.points.length) {
        this.toast('没有可收拢的节点', 'error');
        return;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < idx.points.length; i++) {
        const p = idx.points[i];
        if (p.x == null || p.y == null) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (!isFinite(minX)) return;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      let maxDist = 0;
      for (let i = 0; i < idx.points.length; i++) {
        const p = idx.points[i];
        if (p.x == null || p.y == null) continue;
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d > maxDist) maxDist = d;
      }
      const factor = Math.min(0.55, 1200 / Math.max(1, maxDist));
      const ok = this.transaction(
        '收拢节点',
        (m) => {
          for (let i = 0; i < idx.points.length; i++) {
            const p = idx.points[i];
            if (p.x == null || p.y == null) continue;
            const nx = cx + (p.x - cx) * factor;
            const ny = cy + (p.y - cy) * factor;
            if (Math.abs(nx - p.x) < 0.01 && Math.abs(ny - p.y) < 0.01 && p.vx === 0 && p.vy === 0) continue;
            m.updatePoint(p.id, { x: nx, y: ny, vx: 0, vy: 0 });
          }
        },
        { reheat: 0.3 }
      );
      this.toast(ok ? '已收拢节点' : '节点已经足够集中');
    },

    setMode: function (mode) {
      if (this.view.mode === mode) return;
      this.view.mode = mode;
      this.view.transition = null;
      this.view.camTween = null;
      this.view.orbitTween = null;
      this.updateSpacingTarget();
      this.fit(true);
      this.refreshAll();
      if (this._save) this._save();
      this.toast(mode === '3d' ? '已切换到 3D 多层显示' : '已切换到分层显示');
    },

    worldCenter: function () {
      if (this.view.mode === '3d') return { x: this.view.orbit.tx, y: this.view.orbit.ty };
      return { x: this.view.cam.x, y: this.view.cam.y };
    },

    selectObject: function (type, id) {
      const g = this.graph;
      if (type === 'p') {
        const p = g.points.get(id);
        if (!p) return;
        this.sel = new Set(['p:' + id]);
        if (this.view.mode === '2d' && this.view.currentFloor !== p.floor) this.setCurrentFloor(p.floor, true);
        else this.selectionChanged();
      } else if (type === 'e') {
        const e = g.edges.get(id);
        if (!e) return;
        this.sel = new Set(['e:' + id]);
        const a = g.points.get(e.a);
        if (this.view.mode === '2d' && a && this.view.currentFloor !== a.floor) this.setCurrentFloor(a.floor, true);
        else this.selectionChanged();
      } else if (type === 'f') {
        if (!g.floors.has(id)) return;
        this.sel = new Set(['f:' + id]);
        if (this.view.currentFloor !== id) this.setCurrentFloor(id, true);
        else this.selectionChanged();
      }
    },

    selectionInfo: function () {
      const g = this.graph;
      const points = [];
      const edges = [];
      const floors = [];
      for (const key of this.sel) {
        const info = U.keyInfo(key);
        if (info.type === 'p') {
          const p = g.points.get(info.id);
          if (p) points.push(p);
        } else if (info.type === 'e') {
          const e = g.edges.get(info.id);
          if (e) edges.push(e);
        } else if (info.type === 'f') {
          const f = g.floors.get(info.id);
          if (f) floors.push(f);
        }
      }
      return { points: points, edges: edges, floors: floors };
    },

    /* ------------------------------------------------------------ *
     * export
     * ------------------------------------------------------------ */

    exportImage: function (opts) {
      opts = opts || {};
      this.toast('正在导出图片…');
      const format = opts.format === 'jpeg' ? 'jpeg' : 'png';
      const scale = U.clamp(Number(opts.scale) || 2, 1, 4);
      let W;
      let H;
      if (opts.range === 'view') {
        W = this.W;
        H = this.H;
      } else {
        const k = 2000 / Math.max(this.W, this.H);
        W = Math.round(this.W * k);
        H = Math.round(this.H * k);
      }
      W = Math.max(320, W);
      H = Math.max(240, H);
      const clone = {
        mode: this.view.mode,
        cam: Object.assign({}, this.view.cam),
        orbit: Object.assign({}, this.view.orbit),
        currentFloor: this.view.currentFloor,
        spacing: this.view.spacing,
        showGrid: this.view.showGrid,
        edgeWidth: this.view.edgeWidth,
        nodeRadius: this.view.nodeRadius,
        transition: null,
      };
      if (opts.range !== 'view') {
        GE.Render.fitView(
          { graph: this.graph, view: clone },
          W,
          H,
          { includeHidden: !!opts.includeHidden, padding: 110, maxScale: 6 }
        );
      }
      let dpr = scale;
      while ((W * dpr > 8192 || H * dpr > 8192) && dpr > 1) dpr -= 0.5;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      const ctx = canvas.getContext('2d');
      const transparent = !!opts.transparent && format === 'png';
      const bg = opts.bgColor || '#ffffff';
      const fake = { graph: this.graph, sel: new Set(), hover: null };
      GE.Render.draw(fake, ctx, W, H, {
        view: clone,
        exporting: true,
        dpr: dpr,
        includeGrid: !!opts.includeGrid,
        includeHidden: !!opts.includeHidden,
        background: bg,
        transparent: transparent,
      });
      const baseName = String(opts.filename || 'graph-' + U.timestamp())
        .trim()
        .replace(/\.(png|jpe?g|txt)$/i, '');
      const filename = (baseName || 'graph-' + U.timestamp()) + (format === 'jpeg' ? '.jpg' : '.png');
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const done = (blob) => {
        if (!blob) {
          this.toast('导出失败', 'error');
          return;
        }
        U.download(blob, filename);
        this.toast('已导出 ' + filename);
      };
      if (canvas.toBlob) canvas.toBlob(done, mime, 0.92);
      else {
        const data = canvas.toDataURL(mime, 0.92);
        const a = document.createElement('a');
        a.href = data;
        a.download = filename;
        a.click();
        this.toast('已导出 ' + filename);
      }
    },

    openExport: function () {
      GE.UI.openExport(this);
    },

    openGuide: function () {
      GE.UI.openGuide(this);
    },

    /* ------------------------------------------------------------ *
     * persistence & samples
     * ------------------------------------------------------------ */

    scheduleSave: function () {
      if (this._save) this._save();
    },

    writeSave: function () {
      if (!this.graph || this.graph.edges.size > MAX_SAVE_EDGES) return;
      try {
        const data = {
          text: GE.Parser.serialize(this.graph),
          mode: this.view.mode,
          floor: this.graph.floorDisp(this.view.currentFloor),
          edgeWidth: this.view.edgeWidth,
          nodeRadius: this.view.nodeRadius,
          spacingScale: this.view.spacingScale,
          simParams: Object.assign({}, this.simParams),
          lastEdgeDirected: !!this.lastEdgeDirected,
          physics: !!this.view.physics,
          showGrid: !!this.view.showGrid,
          cam: { x: this.view.cam.x, y: this.view.cam.y, scale: this.view.cam.scale },
          orbit: {
            yaw: this.view.orbit.yaw,
            pitch: this.view.orbit.pitch,
            dist: this.view.orbit.dist,
            tx: this.view.orbit.tx,
            ty: this.view.orbit.ty,
            tz: this.view.orbit.tz,
          },
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch (err) {
        /* storage may be unavailable or full - ignore */
      }
    },

    restore: function () {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data.text !== 'string') return;
        const res = GE.Parser.parse(data.text, { final: true });
        if (!res.ok || res.graph.floors.size < 1) return;
        this.graph = res.graph;
        this._lastParsedText = data.text;
        if (data.mode === '3d' || data.mode === '2d') this.view.mode = data.mode;
        if (isFinite(data.edgeWidth)) {
          this.view.edgeWidth = U.clamp(Number(data.edgeWidth), U.EDGE_WIDTH.MIN, U.EDGE_WIDTH.MAX);
        }
        if (isFinite(data.nodeRadius)) {
          this.view.nodeRadius = U.clamp(Number(data.nodeRadius), U.NODE_RADIUS.MIN, U.NODE_RADIUS.MAX);
        }
        if (isFinite(data.spacingScale)) {
          this.view.spacingScale = U.clamp(Number(data.spacingScale), U.SPACING_SCALE.MIN, U.SPACING_SCALE.MAX);
        }
        if (data.simParams) {
          const merged = Object.assign({}, GE.Layout.DEFAULT_PARAMS);
          for (const key in GE.Layout.PARAM_RANGES) {
            if (isFinite(Number(data.simParams[key]))) merged[key] = Number(data.simParams[key]);
          }
          this.simParams = merged;
          this.sim.setParams(this.simParams);
        }
        if (typeof data.lastEdgeDirected === 'boolean') this.lastEdgeDirected = data.lastEdgeDirected;
        if (typeof data.physics === 'boolean') this.view.physics = data.physics;
        if (typeof data.showGrid === 'boolean') this.view.showGrid = data.showGrid;
        if (data.cam && isFinite(data.cam.x)) {
          this.view.cam = { x: data.cam.x, y: data.cam.y, scale: U.clamp(data.cam.scale || 1, 0.02, 8) };
        }
        if (data.orbit) {
          for (const k of ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz']) {
            if (isFinite(data.orbit[k])) this.view.orbit[k] = data.orbit[k];
          }
        }
        const fid = this.graph.floorIdFromDisp(Number(data.floor));
        if (fid >= 0) this.view.currentFloor = fid;
        this.sim.graph = this.graph;
      } catch (err) {
        /* ignore invalid saved state */
      }
    },

    loadSample: function () {
      const sample = [
        '10 11 3',
        '1 2 1 1 0 2',
        '2 3 1 1 0 3',
        '3 4 1 1 0 4',
        '4 1 1 1 0 5',
        '5 6 2 2 1',
        '6 7 2 2 0 2',
        '7 8 2 2 0 3',
        '8 5 2 2 0 4',
        '9 10 3 3 0 6',
        '2 5 1 2 0 1 跨层',
        '6 9 2 3 1 2',
        'P 1 1 #1d4ed8 起点',
        'P 2 1 #1d4ed8 第二点',
        'P 3 1 #1d4ed8',
        'P 4 1 #1d4ed8',
        'P 2 2 #0f766e 中间层',
        'P 2 2 #0f766e',
        'P 2 2 #0f766e',
        'P 2 2 #0f766e',
        'P 3 3 #b45309 终点层',
        'P 3 3 #b45309',
        'F 1 #1d4ed8 第一层',
        'F 1 #0f766e 第二层',
        'F 1 #b45309 第三层',
      ].join('\n');
      const res = GE.Parser.parse(sample, { final: true });
      if (!res.ok) {
        this.toast('示例载入失败：' + (res.error ? res.error.message : ''), 'error');
        return;
      }
      const next = res.graph;
      GE.Layout.seed(next);
      this.history.push(GE.replaceCommand('载入示例', this.graph, next, null));
      this.graph = next;
      this.sim.graph = next;
      this.sel.clear();
      this.view.currentFloor = next.firstFloorId();
      this.view.mode = '2d';
      this.textError = null;
      this.syncText(true);
      this.afterModelChange({ noText: true, reheat: 0.55 });
      this.settleForFit();
      this.fit(false);
      this.toast('已载入 3 层示例');
    },

    clearAll: function () {
      GE.UI.confirm({
        title: '清空画布',
        message: '将删除所有节点、边和层，仅保留一个空层。可通过撤销恢复。',
        confirmLabel: '清空',
        danger: true,
      }).then((yes) => {
        if (!yes) return;
        const next = GE.emptyGraph({ pointStart: 1, floorStart: 1 });
        this.history.push(GE.replaceCommand('清空画布', this.graph, next, null));
        this.graph = next;
        this.sim.graph = next;
        this.sel.clear();
        this.view.currentFloor = next.firstFloorId();
        this.afterModelChange({ noText: true, reheat: 0 });
        this.syncText(true);
        this.fit(false);
        this.toast('画布已清空');
      });
    },
  };

  GE.App = App;
})(globalThis.GE = globalThis.GE || {});
