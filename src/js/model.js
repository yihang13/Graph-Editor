/* Graph Editor - data model, mutation recording, undo/redo history */
(function (GE) {
  'use strict';

  const U = GE.U;

  const LIMITS = {
    points: 10000,
    edges: 1000000,
    floors: 10000,
  };

  class Graph {
    constructor(settings) {
      this.points = new Map();
      this.edges = new Map();
      this.floors = new Map();
      this.adj = new Map(); // pointId -> Set(edgeId)
      this.settings = { pointStart: 1, floorStart: 1 };
      if (settings) {
        if (settings.pointStart === 0 || settings.pointStart === 1) {
          this.settings.pointStart = settings.pointStart;
        }
        if (settings.floorStart === 0 || settings.floorStart === 1) {
          this.settings.floorStart = settings.floorStart;
        }
      }
      this.version = 1;
      this._seqP = 0;
      this._seqE = 0;
      this._seqF = 0;
      this._index = null;
    }

    bump() {
      this.version++;
      this._index = null;
    }

    /* ---------- id allocation ---------- */

    allocPointId() {
      return this._seqP++;
    }
    allocEdgeId() {
      return this._seqE++;
    }
    allocFloorId() {
      return this._seqF++;
    }

    /* ---------- low level inserts/removes (history replays these) ---------- */

    insertPoint(p) {
      if (this.points.has(p.id)) return this.points.get(p.id);
      if (p.floor == null) {
        const idx = this.getIndex();
        p.floor = idx.floors.length ? idx.floors[0].id : -1;
      }
      if (p.color == null) p.color = '#000000';
      if (p.desc == null) p.desc = '';
      if (p.weight === undefined) p.weight = null;
      if (p.vx == null) p.vx = 0;
      if (p.vy == null) p.vy = 0;
      this.points.set(p.id, p);
      if (!this.adj.has(p.id)) this.adj.set(p.id, new Set());
      if (p.id >= this._seqP) this._seqP = p.id + 1;
      this.bump();
      return p;
    }

    insertEdge(e) {
      if (this.edges.has(e.id)) return this.edges.get(e.id);
      if (e.color == null) e.color = '#000000';
      if (e.desc == null) e.desc = '';
      if (e.weight === undefined) e.weight = null;
      e.directed = !!e.directed;
      this.edges.set(e.id, e);
      let sa = this.adj.get(e.a);
      if (!sa) {
        sa = new Set();
        this.adj.set(e.a, sa);
      }
      sa.add(e.id);
      let sb = this.adj.get(e.b);
      if (!sb) {
        sb = new Set();
        this.adj.set(e.b, sb);
      }
      sb.add(e.id);
      if (e.id >= this._seqE) this._seqE = e.id + 1;
      this.bump();
      return e;
    }

    insertFloor(f) {
      if (this.floors.has(f.id)) return this.floors.get(f.id);
      if (f.visible == null) f.visible = true;
      if (f.desc == null) f.desc = '';
      f.color = U.normColor(f.color) || U.DEFAULT_LAYER_COLOR;
      this.floors.set(f.id, f);
      if (f.id >= this._seqF) this._seqF = f.id + 1;
      this.bump();
      return f;
    }

    removePoint(id) {
      const p = this.points.get(id);
      if (!p) return null;
      const incident = this.adj.get(id);
      if (incident && incident.size) {
        throw new Error('removePoint: point ' + id + ' still has edges');
      }
      this.points.delete(id);
      this.adj.delete(id);
      this.bump();
      return p;
    }

    removeEdge(id) {
      const e = this.edges.get(id);
      if (!e) return null;
      this.edges.delete(id);
      const sa = this.adj.get(e.a);
      if (sa) sa.delete(id);
      const sb = this.adj.get(e.b);
      if (sb) sb.delete(id);
      this.bump();
      return e;
    }

    removeFloor(id) {
      const f = this.floors.get(id);
      if (!f) return null;
      this.floors.delete(id);
      this.bump();
      return f;
    }

    setSettings(patch) {
      if (patch.pointStart === 0 || patch.pointStart === 1) this.settings.pointStart = patch.pointStart;
      if (patch.floorStart === 0 || patch.floorStart === 1) this.settings.floorStart = patch.floorStart;
      this.bump();
    }

    /* ---------- lookups ---------- */

    getIndex() {
      if (this._index) return this._index;
      const points = Array.from(this.points.values()).sort(function (a, b) {
        return a.id - b.id;
      });
      const floors = Array.from(this.floors.values()).sort(function (a, b) {
        return a.id - b.id;
      });
      const edges = Array.from(this.edges.values()).sort(function (a, b) {
        return a.id - b.id;
      });
      const pointDisp = new Map();
      const floorDisp = new Map();
      const pointByDisp = new Map();
      const floorByDisp = new Map();
      for (let i = 0; i < points.length; i++) {
        const d = i + this.settings.pointStart;
        pointDisp.set(points[i].id, d);
        pointByDisp.set(d, points[i].id);
      }
      for (let i = 0; i < floors.length; i++) {
        const d = i + this.settings.floorStart;
        floorDisp.set(floors[i].id, d);
        floorByDisp.set(d, floors[i].id);
      }
      const byFloor = new Map();
      for (let i = 0; i < floors.length; i++) byFloor.set(floors[i].id, []);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        let arr = byFloor.get(p.floor);
        if (!arr) {
          arr = [];
          byFloor.set(p.floor, arr);
        }
        arr.push(p);
      }
      const edgesByFloor = new Map();
      const crossByFloor = new Map();
      for (let i = 0; i < floors.length; i++) {
        edgesByFloor.set(floors[i].id, []);
        crossByFloor.set(floors[i].id, []);
      }
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const pa = this.points.get(e.a);
        const pb = this.points.get(e.b);
        if (!pa || !pb) continue;
        if (pa.floor === pb.floor) {
          const arr = edgesByFloor.get(pa.floor);
          if (arr) arr.push(e);
        } else {
          const arrA = crossByFloor.get(pa.floor);
          if (arrA) arrA.push(e);
          const arrB = crossByFloor.get(pb.floor);
          if (arrB) arrB.push(e);
        }
      }
      const degrees = new Map();
      for (let i = 0; i < points.length; i++) {
        const s = this.adj.get(points[i].id);
        degrees.set(points[i].id, s ? s.size : 0);
      }
      this._index = {
        points: points,
        floors: floors,
        edges: edges,
        pointDisp: pointDisp,
        floorDisp: floorDisp,
        pointByDisp: pointByDisp,
        floorByDisp: floorByDisp,
        byFloor: byFloor,
        edgesByFloor: edgesByFloor,
        crossByFloor: crossByFloor,
        degrees: degrees,
      };
      return this._index;
    }

    pointDisp(id) {
      const idx = this.getIndex();
      const v = idx.pointDisp.get(id);
      return v == null ? id + this.settings.pointStart : v;
    }

    floorDisp(id) {
      const idx = this.getIndex();
      const v = idx.floorDisp.get(id);
      return v == null ? id + this.settings.floorStart : v;
    }

    pointIdFromDisp(d) {
      const v = this.getIndex().pointByDisp.get(d);
      return v == null ? -1 : v;
    }

    floorIdFromDisp(d) {
      const v = this.getIndex().floorByDisp.get(d);
      return v == null ? -1 : v;
    }

    firstFloorId() {
      const floors = this.getIndex().floors;
      return floors.length ? floors[0].id : -1;
    }

    lastFloorId() {
      const floors = this.getIndex().floors;
      return floors.length ? floors[floors.length - 1].id : -1;
    }

    hasPoint(id) {
      return this.points.has(id);
    }
    hasEdge(id) {
      return this.edges.has(id);
    }
    hasFloor(id) {
      return this.floors.has(id);
    }

    degree(id) {
      const s = this.adj.get(id);
      return s ? s.size : 0;
    }

    incidentEdges(id) {
      const s = this.adj.get(id);
      return s ? Array.from(s) : [];
    }

    stats() {
      return {
        points: this.points.size,
        edges: this.edges.size,
        floors: this.floors.size,
      };
    }

    cloneSettings() {
      return { pointStart: this.settings.pointStart, floorStart: this.settings.floorStart };
    }
  }

  /* ------------------------------------------------------------------ *
   * Mutator: applies changes immediately and records them for undo.
   * ------------------------------------------------------------------ */

  class Mutator {
    constructor(graph, label, opts) {
      this.g = graph;
      this.label = label || '编辑';
      this.opts = opts || {};
      this.pAdd = [];
      this.pDel = [];
      this.pUpd = new Map();
      this.eAdd = [];
      this.eDel = [];
      this.eUpd = new Map();
      this.fAdd = [];
      this.fDel = [];
      this.fUpd = new Map();
      this.settingsBefore = graph.cloneSettings();
      this.touched = false;
      this._pAddIds = new Set();
      this._eAddIds = new Set();
      this._fAddIds = new Set();
    }

    _defaultFloor() {
      return this.g.firstFloorId();
    }

    addPoint(attrs) {
      attrs = attrs || {};
      const g = this.g;
      const p = {
        id: attrs.id != null ? attrs.id : g.allocPointId(),
        floor: attrs.floor != null ? attrs.floor : this._defaultFloor(),
        weight: attrs.weight !== undefined ? attrs.weight : null,
        color: attrs.color != null ? attrs.color : '#000000',
        desc: attrs.desc != null ? attrs.desc : '',
        x: attrs.x,
        y: attrs.y,
        vx: 0,
        vy: 0,
      };
      g.insertPoint(p);
      this.pAdd.push(U.clonePoint(p));
      this._pAddIds.add(p.id);
      this.touched = true;
      return p;
    }

    addEdge(attrs) {
      const g = this.g;
      const e = {
        id: attrs.id != null ? attrs.id : g.allocEdgeId(),
        a: attrs.a,
        b: attrs.b,
        directed: !!attrs.directed,
        weight: attrs.weight !== undefined ? attrs.weight : null,
        color: attrs.color != null ? attrs.color : '#000000',
        desc: attrs.desc != null ? attrs.desc : '',
      };
      g.insertEdge(e);
      this.eAdd.push(U.cloneEdge(e));
      this._eAddIds.add(e.id);
      this.touched = true;
      return e;
    }

    addFloor(attrs) {
      attrs = attrs || {};
      const g = this.g;
      const f = {
        id: attrs.id != null ? attrs.id : g.allocFloorId(),
        visible: attrs.visible !== undefined ? !!attrs.visible : true,
        desc: attrs.desc != null ? attrs.desc : '',
        color: U.normColor(attrs.color) || U.DEFAULT_LAYER_COLOR,
      };
      g.insertFloor(f);
      this.fAdd.push(U.cloneFloor(f));
      this._fAddIds.add(f.id);
      this.touched = true;
      return f;
    }

    removeEdge(id) {
      const g = this.g;
      const e = g.edges.get(id);
      if (!e) return;
      this.eUpd.delete(id);
      if (this._eAddIds.has(id)) {
        // edge created and removed within the same transaction: cancel both
        this.eAdd = this.eAdd.filter(function (x) {
          return x.id !== id;
        });
        this._eAddIds.delete(id);
      } else {
        this.eDel.push(U.cloneEdge(e));
      }
      g.removeEdge(id);
      this.touched = true;
    }

    removePoint(id) {
      const g = this.g;
      const p = g.points.get(id);
      if (!p) return;
      const eids = g.incidentEdges(id);
      for (let i = 0; i < eids.length; i++) this.removeEdge(eids[i]);
      this.pUpd.delete(id);
      if (this._pAddIds.has(id)) {
        this.pAdd = this.pAdd.filter(function (x) {
          return x.id !== id;
        });
        this._pAddIds.delete(id);
      } else {
        this.pDel.push(U.clonePoint(p));
      }
      g.removePoint(id);
      this.touched = true;
    }

    removeFloor(id) {
      const g = this.g;
      const f = g.floors.get(id);
      if (!f) return;
      const idx = g.getIndex();
      const pts = idx.byFloor.get(id) || [];
      const ids = pts.map(function (p) {
        return p.id;
      });
      for (let i = 0; i < ids.length; i++) this.removePoint(ids[i]);
      this.fUpd.delete(id);
      if (this._fAddIds.has(id)) {
        this.fAdd = this.fAdd.filter(function (x) {
          return x.id !== id;
        });
        this._fAddIds.delete(id);
      } else {
        this.fDel.push(U.cloneFloor(f));
      }
      g.removeFloor(id);
      this.touched = true;
    }

    updatePoint(id, patch) {
      const g = this.g;
      const p = g.points.get(id);
      if (!p) return;
      const entry = this.pUpd.get(id);
      const before = entry ? entry.before : U.clonePoint(p);
      for (const k in patch) {
        if (k === 'id') continue;
        p[k] = patch[k];
      }
      const after = U.clonePoint(p);
      if (U.sameJson(before, after)) {
        this.pUpd.delete(id);
      } else {
        this.pUpd.set(id, { id: id, before: before, after: after });
      }
      g.bump();
      this.touched = true;
    }

    updateEdge(id, patch) {
      const g = this.g;
      const e = g.edges.get(id);
      if (!e) return;
      const entry = this.eUpd.get(id);
      const before = entry ? entry.before : U.cloneEdge(e);
      for (const k in patch) {
        if (k === 'id') continue;
        e[k] = patch[k];
      }
      const after = U.cloneEdge(e);
      if (U.sameJson(before, after)) {
        this.eUpd.delete(id);
      } else {
        this.eUpd.set(id, { id: id, before: before, after: after });
      }
      g.bump();
      this.touched = true;
    }

    updateFloor(id, patch) {
      const g = this.g;
      const f = g.floors.get(id);
      if (!f) return;
      const entry = this.fUpd.get(id);
      const before = entry ? entry.before : U.cloneFloor(f);
      for (const k in patch) {
        if (k === 'id') continue;
        f[k] = patch[k];
      }
      const after = U.cloneFloor(f);
      if (U.sameJson(before, after)) {
        this.fUpd.delete(id);
      } else {
        this.fUpd.set(id, { id: id, before: before, after: after });
      }
      g.bump();
      this.touched = true;
    }

    setSettings(patch) {
      this.g.setSettings(patch);
      this.touched = true;
    }

    toCommand() {
      const settingsAfter = this.g.cloneSettings();
      const settingsChanged =
        settingsAfter.pointStart !== this.settingsBefore.pointStart ||
        settingsAfter.floorStart !== this.settingsBefore.floorStart;
      if (!this.touched && !settingsChanged) return null;
      return {
        label: this.label,
        graph: this.g,
        pAdd: this.pAdd,
        pDel: this.pDel,
        pUpd: Array.from(this.pUpd.values()),
        eAdd: this.eAdd,
        eDel: this.eDel,
        eUpd: Array.from(this.eUpd.values()),
        fAdd: this.fAdd,
        fDel: this.fDel,
        fUpd: Array.from(this.fUpd.values()),
        settingsBefore: this.settingsBefore,
        settingsAfter: settingsAfter,
        replace: null,
        time: Date.now(),
        coalesceKey: this.opts.coalesceKey || null,
      };
    }
  }

  function replaceCommand(label, beforeGraph, afterGraph, coalesceKey) {
    return {
      label: label,
      graph: afterGraph,
      pAdd: [],
      pDel: [],
      pUpd: [],
      eAdd: [],
      eDel: [],
      eUpd: [],
      fAdd: [],
      fDel: [],
      fUpd: [],
      settingsBefore: beforeGraph.cloneSettings(),
      settingsAfter: afterGraph.cloneSettings(),
      replace: { before: beforeGraph, after: afterGraph },
      time: Date.now(),
      coalesceKey: coalesceKey || null,
    };
  }

  /* ------------------------------------------------------------------ *
   * Command application / reversion
   * ------------------------------------------------------------------ */

  function applyFields(target, source) {
    if (!target || !source) return;
    for (const k in source) {
      if (k === 'id') continue;
      target[k] = Array.isArray(source[k]) ? source[k].slice() : source[k];
    }
  }

  function applyCommand(cmd, graph, forward) {
    if (cmd.replace) {
      const g = forward ? cmd.replace.after : cmd.replace.before;
      g.bump();
      return g;
    }
    const g = graph;

    function addPoints(list) {
      for (let i = 0; i < list.length; i++) g.insertPoint(U.clonePoint(list[i]));
    }
    function removePoints(list) {
      for (let i = 0; i < list.length; i++) {
        if (g.points.has(list[i].id)) {
          try {
            g.removePoint(list[i].id);
          } catch (err) {
            const eids = g.incidentEdges(list[i].id);
            for (let j = 0; j < eids.length; j++) g.removeEdge(eids[j]);
            g.removePoint(list[i].id);
          }
        }
      }
    }
    function addEdges(list) {
      for (let i = 0; i < list.length; i++) {
        if (!g.edges.has(list[i].id)) g.insertEdge(U.cloneEdge(list[i]));
      }
    }
    function removeEdges(list) {
      for (let i = 0; i < list.length; i++) {
        if (g.edges.has(list[i].id)) g.removeEdge(list[i].id);
      }
    }
    function addFloors(list) {
      for (let i = 0; i < list.length; i++) {
        if (!g.floors.has(list[i].id)) g.insertFloor(U.cloneFloor(list[i]));
      }
    }
    function removeFloors(list) {
      for (let i = 0; i < list.length; i++) {
        if (g.floors.has(list[i].id)) g.removeFloor(list[i].id);
      }
    }

    if (forward) {
      removeEdges(cmd.eDel);
      removePoints(cmd.pDel);
      removeFloors(cmd.fDel);
      addFloors(cmd.fAdd);
      addPoints(cmd.pAdd);
      addEdges(cmd.eAdd);
      for (let i = 0; i < cmd.pUpd.length; i++) {
        const p = g.points.get(cmd.pUpd[i].id);
        if (p) applyFields(p, cmd.pUpd[i].after);
      }
      for (let i = 0; i < cmd.eUpd.length; i++) {
        const e = g.edges.get(cmd.eUpd[i].id);
        if (e) applyFields(e, cmd.eUpd[i].after);
      }
      for (let i = 0; i < cmd.fUpd.length; i++) {
        const f = g.floors.get(cmd.fUpd[i].id);
        if (f) applyFields(f, cmd.fUpd[i].after);
      }
      g.settings.pointStart = cmd.settingsAfter.pointStart;
      g.settings.floorStart = cmd.settingsAfter.floorStart;
    } else {
      removeEdges(cmd.eAdd);
      removePoints(cmd.pAdd);
      removeFloors(cmd.fAdd);
      addFloors(cmd.fDel);
      addPoints(cmd.pDel);
      addEdges(cmd.eDel);
      for (let i = 0; i < cmd.pUpd.length; i++) {
        const p = g.points.get(cmd.pUpd[i].id);
        if (p) applyFields(p, cmd.pUpd[i].before);
      }
      for (let i = 0; i < cmd.eUpd.length; i++) {
        const e = g.edges.get(cmd.eUpd[i].id);
        if (e) applyFields(e, cmd.eUpd[i].before);
      }
      for (let i = 0; i < cmd.fUpd.length; i++) {
        const f = g.floors.get(cmd.fUpd[i].id);
        if (f) applyFields(f, cmd.fUpd[i].before);
      }
      g.settings.pointStart = cmd.settingsBefore.pointStart;
      g.settings.floorStart = cmd.settingsBefore.floorStart;
    }
    g.bump();
    return g;
  }

  class History {
    constructor(limit) {
      this.limit = limit || 300;
      this.undoStack = [];
      this.redoStack = [];
      this.onChange = null;
    }

    canUndo() {
      return this.undoStack.length > 0;
    }
    canRedo() {
      return this.redoStack.length > 0;
    }
    undoLabel() {
      const c = this.undoStack[this.undoStack.length - 1];
      return c ? c.label : '';
    }
    redoLabel() {
      const c = this.redoStack[this.redoStack.length - 1];
      return c ? c.label : '';
    }

    push(cmd) {
      if (!cmd) return false;
      const last = this.undoStack[this.undoStack.length - 1];
      if (cmd.coalesceKey && last && last.coalesceKey === cmd.coalesceKey && cmd.time - last.time < 900) {
        if (cmd.replace && last.replace) {
          last.replace.after = cmd.replace.after;
          last.settingsAfter = cmd.settingsAfter;
        } else {
          last.pAdd = last.pAdd.concat(cmd.pAdd);
          last.pDel = last.pDel.concat(cmd.pDel);
          last.eAdd = last.eAdd.concat(cmd.eAdd);
          last.eDel = last.eDel.concat(cmd.eDel);
          last.fAdd = last.fAdd.concat(cmd.fAdd);
          last.fDel = last.fDel.concat(cmd.fDel);
          for (let i = 0; i < cmd.pUpd.length; i++) last.pUpd.push(cmd.pUpd[i]);
          for (let i = 0; i < cmd.eUpd.length; i++) last.eUpd.push(cmd.eUpd[i]);
          for (let i = 0; i < cmd.fUpd.length; i++) last.fUpd.push(cmd.fUpd[i]);
          last.settingsAfter = cmd.settingsAfter;
        }
        last.time = cmd.time;
        last.label = cmd.label;
      } else {
        this.undoStack.push(cmd);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
      }
      this.redoStack.length = 0;
      if (this.onChange) this.onChange();
      return true;
    }

    undo(graph) {
      const cmd = this.undoStack.pop();
      if (!cmd) return null;
      this.redoStack.push(cmd);
      const next = applyCommand(cmd, graph, false);
      if (this.onChange) this.onChange();
      return { graph: next, cmd: cmd };
    }

    redo(graph) {
      const cmd = this.redoStack.pop();
      if (!cmd) return null;
      this.undoStack.push(cmd);
      const next = applyCommand(cmd, graph, true);
      if (this.onChange) this.onChange();
      return { graph: next, cmd: cmd };
    }

    clear() {
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      if (this.onChange) this.onChange();
    }
  }

  function emptyGraph(settings) {
    const g = new Graph(settings || { pointStart: 1, floorStart: 1 });
    g.insertFloor({ id: 0, visible: true, desc: '' });
    g.bump();
    return g;
  }

  GE.LIMITS = LIMITS;
  GE.Graph = Graph;
  GE.Mutator = Mutator;
  GE.History = History;
  GE.replaceCommand = replaceCommand;
  GE.applyCommand = applyCommand;
  GE.emptyGraph = emptyGraph;
})(globalThis.GE = globalThis.GE || {});
