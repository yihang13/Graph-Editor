/* Graph Editor - editor panel, toolbar, dialogs, guides */
(function (GE) {
  'use strict';

  const U = GE.U;

  const ICON_PATHS = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h2"/>',
    selectAll:
      '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="m9 12 2 2 4-4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    cut: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 8l12 12M8 16 20 4"/>',
    paste:
      '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9z"/><path d="M9 12h6M9 16h6"/>',
    trash:
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/><path d="M10 11v5M14 11v5"/>',
    fit: '<path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/>',
    cube: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5"/><path d="M12 12v10"/>',
    reset: '<circle cx="12" cy="12" r="9"/><path d="M12 3v3"/><path d="m12 12 4-3"/>',
    physics: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    gather:
      '<path d="M9 9H4V4"/><path d="m4 4 5 5"/><path d="M15 15h5v5"/><path d="m20 20-5-5"/><path d="M15 9h5V4"/><path d="m20 4-5 5"/><path d="M9 15H4v5"/><path d="m4 20 5-5"/>',
    export: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
    guide:
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:
      '<path d="m3 3 18 18"/><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
  };

  function icon(name) {
    return (
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICON_PATHS[name] || '') +
      '</svg>'
    );
  }

  const TOOLS = [
    { id: 'undo', icon: 'undo', label: '撤销', act: (a) => a.undo() },
    { id: 'redo', icon: 'redo', label: '重做', act: (a) => a.redo() },
    { sep: true },
    { id: 'select-all', icon: 'selectAll', label: '全选', act: (a) => a.selectAll() },
    { id: 'copy', icon: 'copy', label: '复制', act: (a) => a.copySelection() },
    { id: 'cut', icon: 'cut', label: '剪切', act: (a) => a.cutSelection() },
    { id: 'paste', icon: 'paste', label: '粘贴', act: (a) => a.pasteSelection() },
    { id: 'delete', icon: 'trash', label: '删除选中', act: (a) => a.deleteSelection() },
    { sep: true },
    { id: 'fit', icon: 'fit', label: '适应视图', act: (a) => a.fit(true) },
    { id: 'gather', icon: 'gather', label: '收拢', act: (a) => a.gatherNodes() },
    { id: 'mode', icon: 'cube', label: '切换 3D 多层显示', act: (a) => a.setMode(a.view.mode === '2d' ? '3d' : '2d') },
    { id: 'reset', icon: 'reset', label: '回正视角', act: (a) => a.resetView() },
    { sep: true },
    { id: 'physics', icon: 'physics', label: '物理效果', act: (a) => a.togglePhysics() },
    { id: 'grid', icon: 'grid', label: '网格', act: (a) => a.toggleGrid() },
    { sep: true },
    { id: 'export', icon: 'export', label: '导出 PNG / JPEG', act: (a) => a.openExport() },
    { id: 'guide', icon: 'guide', label: '操作指南', act: (a) => a.openGuide() },
  ];

  function fieldHtml(label, controlHtml, hint) {
    return (
      '<label class="field"><span class="field-label">' +
      U.escapeHtml(label) +
      '</span>' +
      controlHtml +
      (hint ? '<span class="field-hint">' + hint + '</span>' : '') +
      '</label>'
    );
  }

  function floorOptions(app, selectedFid) {
    const idx = app.graph.getIndex();
    if (idx.floors.length > 400) {
      return (
        '<input class="input" type="number" step="1" value="' +
        (selectedFid != null ? app.graph.floorDisp(selectedFid) : app.graph.floorDisp(app.view.currentFloor)) +
        '">'
      );
    }
    let html = '<select class="input">';
    for (let i = 0; i < idx.floors.length; i++) {
      const f = idx.floors[i];
      html +=
        '<option value="' +
        app.graph.floorDisp(f.id) +
        '"' +
        (f.id === selectedFid ? ' selected' : '') +
        '>层 ' +
        app.graph.floorDisp(f.id) +
        (f.desc ? ' · ' + U.escapeHtml(U.truncate(f.desc, 10)) : '') +
        '</option>';
    }
    html += '</select>';
    return html;
  }

  const UI = {
    app: null,
    els: {},
    textArea: null,
    textStatus: null,
    modalCount: 0,
    objectListOpen: false,
    _tip: null,
    _tipAt: 0,

    init: function (app) {
      this.app = app;
      const $ = (id) => document.getElementById(id);
      this.els = {
        editor: $('editor'),
        toolbar: $('toolbar'),
        stage: $('stage'),
        hud: $('hud'),
        empty: $('empty-state'),
        floorList: $('floor-list'),
        floorCountHint: $('floor-count-hint'),
        selectionBody: $('selection-body'),
        segPoint: $('seg-point'),
        segFloor: $('seg-floor'),
        paneUI: $('pane-ui'),
        paneText: $('pane-text'),
        tabs: Array.prototype.slice.call(document.querySelectorAll('.tab')),
        layerBar: $('layer-bar'),
        floorSlider: $('floor-slider'),
        floorInput: $('floor-input'),
        floorCurrentDesc: $('floor-current-desc'),
        floorTotal: $('floor-total'),
        modalRoot: $('modal-root'),
        toastWrap: $('toast-wrap'),
        tip: $('canvas-tip'),
        textFile: $('text-file'),
        resizer: $('editor-resizer'),
        expandHandle: $('expand-handle'),
      };
      this.textArea = $('text-input');
      this.textStatus = $('text-status');
      this.prefInputs = Array.prototype.slice.call(document.querySelectorAll('[data-pref]'));

      this.buildToolbar();
      this.wireEditor();
      this.wireToolbar();
      this.wireLayerBar();
      this.wireText();
      this.wireEmpty();
      this.wireModals();

      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => app.resize());
        ro.observe(this.els.stage);
      }
      window.addEventListener('resize', () => app.resize());
      this.restoreEditorWidth();
    },

    /* ------------------------------------------------------------ *
     * construction / wiring
     * ------------------------------------------------------------ */

    buildToolbar: function () {
      let html = '';
      for (let i = 0; i < TOOLS.length; i++) {
        const t = TOOLS[i];
        if (t.sep) {
          html += '<div class="tool-sep"></div>';
          continue;
        }
        html +=
          '<button class="tool" data-tool="' +
          t.id +
          '" title="' +
          U.escapeHtml(t.label) +
          '" aria-label="' +
          U.escapeHtml(t.label) +
          '">' +
          icon(t.icon) +
          '</button>';
      }
      this.els.toolbar.innerHTML = html;
    },

    wireToolbar: function () {
      this.els.toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tool]');
        if (!btn) return;
        const def = TOOLS.find((t) => t.id === btn.dataset.tool);
        if (!def) return;
        this.hideTip();
        def.act(this.app);
      });
    },

    wireEditor: function () {
      const app = this.app;
      const body = this.els.paneUI;
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'new-point') app.newPoint();
        else if (act === 'new-edge') this.openNewEdge(app);
        else if (act === 'new-floor') app.newFloor();
        else if (act === 'edit') app.editSelection();
        else if (act === 'delete-sel') app.deleteSelection();
        else if (act === 'reset-prefs') app.resetPreferences();
        else if (act === 'clear-sel') {
          app.sel.clear();
          app.selectionChanged();
        }
      });
      this.els.selectionBody.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-pick-toggle]');
        if (toggle) {
          this.objectListOpen = !this.objectListOpen;
          this.refreshSelection(app);
          return;
        }
        const pick = e.target.closest('[data-pick-type]');
        if (pick) {
          app.selectObject(pick.dataset.pickType, Number(pick.dataset.pickId));
          return;
        }
        const chip = e.target.closest('[data-selkey]');
        if (!chip) return;
        app.sel = new Set([chip.dataset.selkey]);
        app.selectionChanged();
      });
      this.els.segPoint.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-start]');
        if (b) app.setNumbering('point', Number(b.dataset.start));
      });
      this.els.segFloor.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-start]');
        if (b) app.setNumbering('floor', Number(b.dataset.start));
      });
      this.prefInputs.forEach((el) => {
        el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
          app.setPreference(el.dataset.pref, el.value);
        });
      });

      this.els.floorList.addEventListener('click', (e) => {
        const row = e.target.closest('.floor-row');
        if (!row) return;
        const fid = Number(row.dataset.fid);
        const eye = e.target.closest('[data-eye]');
        if (eye) {
          e.stopPropagation();
          app.toggleFloorVisibility(fid);
          return;
        }
        if (e.shiftKey) {
          const key = 'f:' + fid;
          if (app.sel.has(key)) app.sel.delete(key);
          else app.sel.add(key);
          app.selectionChanged();
          return;
        }
        app.sel = new Set(['f:' + fid]);
        app.selectionChanged();
        app.setCurrentFloor(fid, true);
      });
      this.els.floorList.addEventListener('dblclick', (e) => {
        const row = e.target.closest('.floor-row');
        if (!row) return;
        const fid = Number(row.dataset.fid);
        app.sel = new Set(['f:' + fid]);
        app.selectionChanged();
        this.openFloorProps(app, fid);
      });

      const tabs = this.els.tabs;
      for (let i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', () => this.switchTab(tabs[i].dataset.tab));
      }

      document.getElementById('btn-collapse').addEventListener('click', () => this.toggleEditor(false));
      this.els.expandHandle.addEventListener('click', () => this.toggleEditor(true));
      document.getElementById('btn-clear').addEventListener('click', () => app.clearAll());
      document.getElementById('btn-guide-head').addEventListener('click', () => app.openGuide());

      this.wireResizer();
    },

    wireResizer: function () {
      const app = this.app;
      const handle = this.els.resizer;
      const editor = this.els.editor;
      let dragging = false;
      let startX = 0;
      let startW = 0;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        startX = e.clientX;
        startW = editor.getBoundingClientRect().width;
        editor.classList.add('is-resizing');
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const w = U.clamp(startW + (e.clientX - startX), 220, 620);
        editor.style.width = w + 'px';
        app.resize();
      });
      const end = () => {
        if (!dragging) return;
        dragging = false;
        editor.classList.remove('is-resizing');
        try {
          localStorage.setItem('graph-editor:editor-width', String(editor.getBoundingClientRect().width));
        } catch (err) {
          /* ignore */
        }
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    },

    restoreEditorWidth: function () {
      try {
        const w = Number(localStorage.getItem('graph-editor:editor-width'));
        if (w >= 220 && w <= 620) this.els.editor.style.width = w + 'px';
      } catch (err) {
        /* ignore */
      }
    },

    toggleEditor: function (open) {
      this.els.editor.classList.toggle('is-collapsed', !open);
      this.els.expandHandle.classList.toggle('is-visible', !open);
      setTimeout(() => this.app.resize(), 220);
    },

    wireLayerBar: function () {
      const app = this.app;
      const bar = this.els.layerBar;
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'floor-prev') app.stepFloor(-1);
        else if (btn.dataset.act === 'floor-next') app.stepFloor(1);
      });
      this.els.floorSlider.addEventListener('input', () => {
        const idx = this.app.graph.getIndex();
        const rank = Number(this.els.floorSlider.value);
        if (idx.floors[rank]) app.setCurrentFloor(idx.floors[rank].id, true);
      });
      this.els.floorInput.addEventListener('change', () => {
        const v = Number(this.els.floorInput.value);
        if (!isFinite(v)) {
          this.refreshLayerBar(app);
          return;
        }
        const fid = app.graph.floorIdFromDisp(v);
        if (fid >= 0) app.setCurrentFloor(fid, true);
        else this.toast('层级编号 ' + v + ' 不存在', 'error');
        this.refreshLayerBar(app);
      });
    },

    wireText: function () {
      const app = this.app;
      const ta = this.textArea;
      ta.addEventListener('input', () => app.onTextInput());
      ta.addEventListener('blur', () => app.onTextBlur());
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      document.querySelectorAll('[data-text-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.textAct;
          if (act === 'import') this.els.textFile.click();
          else if (act === 'download') app.downloadText();
          else if (act === 'rewrite') app.rewriteTextFromModel();
        });
      });
      this.els.textFile.addEventListener('change', () => {
        const f = this.els.textFile.files && this.els.textFile.files[0];
        if (f) app.importTextFile(f);
        this.els.textFile.value = '';
      });
      this.textStatus.addEventListener('click', (e) => {
        const b = e.target.closest('[data-line]');
        if (b) this.selectLine(Number(b.dataset.line));
      });
    },

    wireEmpty: function () {
      const app = this.app;
      this.els.empty.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'empty-new') app.newPoint();
        else if (b.dataset.act === 'empty-sample') app.loadSample();
        else if (b.dataset.act === 'empty-guide') app.openGuide();
      });
    },

    wireModals: function () {
      document.addEventListener('mousemove', (e) => {
        if (!this._tip || !this._tip.classList.contains('is-visible')) return;
        this.positionTip(e.clientX, e.clientY);
      });
    },

    /* ------------------------------------------------------------ *
     * refresh
     * ------------------------------------------------------------ */

    refresh: function (app) {
      this.refreshNumbering(app);
      this.refreshPreferences(app);
      this.refreshSelection(app);
      this.refreshFloors(app);
      this.updateToolbar(app);
      this.updateLayerBar(app);
      const hasPoints = app.graph.points.size > 0;
      this.els.empty.classList.toggle('is-hidden', hasPoints);
      this.els.floorCountHint.textContent = app.graph.floors.size + ' 层';
    },

    refreshPreferences: function (app, force) {
      const values = {
        edgeWidth: app.view.edgeWidth,
        nodeRadius: app.view.nodeRadius,
        spacingScale: app.view.spacingScale,
        repulsion: app.simParams.repulsion,
        damping: app.simParams.damping,
        spring: app.simParams.spring,
        restLength: app.simParams.restLength,
      };
      const inputs = this.prefInputs || [];
      for (let i = 0; i < inputs.length; i++) {
        const el = inputs[i];
        const value = values[el.dataset.pref];
        if (value == null) continue;
        if (!force && document.activeElement === el) continue;
        el.value = String(value);
      }
    },

    refreshNumbering: function (app) {
      const ps = app.graph.settings.pointStart;
      const fs = app.graph.settings.floorStart;
      this.els.segPoint.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('is-active', Number(b.dataset.start) === ps);
      });
      this.els.segFloor.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('is-active', Number(b.dataset.start) === fs);
      });
    },

    refreshSelection: function (app) {
      const info = app.selectionInfo();
      const total = info.points.length + info.edges.length + info.floors.length;
      const body = this.els.selectionBody;
      if (!total) {
        body.innerHTML = this.objectPickerHtml(app);
        return;
      }
      const chips = [];
      const maxChips = 14;
      let shown = 0;
      for (const p of info.points) {
        if (shown++ >= maxChips) break;
        chips.push('<button class="chip chip-point" data-selkey="p:' + p.id + '">#' + app.graph.pointDisp(p.id) + '</button>');
      }
      for (const e of info.edges) {
        if (shown++ >= maxChips) break;
        const a = app.graph.points.get(e.a);
        const b = app.graph.points.get(e.b);
        const label =
          app.graph.pointDisp(e.a) +
          (e.directed ? '→' : '—') +
          app.graph.pointDisp(e.b) +
          (a && b && a.floor !== b.floor ? '·跨层' : '');
        chips.push('<button class="chip chip-edge" data-selkey="e:' + e.id + '">' + label + '</button>');
      }
      for (const f of info.floors) {
        if (shown++ >= maxChips) break;
        chips.push('<button class="chip chip-floor" data-selkey="f:' + f.id + '">层 ' + app.graph.floorDisp(f.id) + '</button>');
      }
      if (total > maxChips) chips.push('<span class="chip-more">…共 ' + total + ' 个</span>');
      body.innerHTML =
        '<div class="sel-chips">' +
        chips.join('') +
        '</div><div class="sel-actions"><button class="btn btn-sm" data-act="edit">编辑选中</button><button class="btn btn-sm btn-danger-ghost" data-act="delete-sel">删除</button><button class="btn btn-sm btn-ghost" data-act="clear-sel">取消选择</button></div>';
    },

    pickGroupHtml: function (title, total, items, more) {
      return (
        '<div class="pick-group"><div class="pick-group-head"><span>' +
        title +
        '</span><span>' +
        U.formatInt(total) +
        '</span></div><div class="pick-list">' +
        items.join('') +
        '</div>' +
        (more ? '<div class="pick-more">仅显示前 30 个</div>' : '') +
        '</div>'
      );
    },

    objectPickerHtml: function (app) {
      const g = app.graph;
      const idx = g.getIndex();
      const cap = 30;
      const total = idx.points.length + idx.edges.length + idx.floors.length;
      const open = !!this.objectListOpen;
      const toggle =
        '<button class="pick-toggle' +
        (open ? ' is-open' : '') +
        '" data-pick-toggle="1" aria-expanded="' +
        (open ? 'true' : 'false') +
        '"><span>对象列表</span><span class="pick-toggle-meta">' +
        U.formatInt(total) +
        ' 个 · ' +
        (open ? '收起' : '展开') +
        '</span><span class="pick-chev">›</span></button>';
      const hint = '<div class="pick-hint">未选中对象。' + (open ? '点击列表中的对象进行选择。' : '展开对象列表选择，或直接点击画布。') + ' Shift 可多选。</div>';
      if (!open) return hint + toggle;
      const groups = [];
      if (idx.points.length) {
        const items = [];
        const lim = Math.min(cap, idx.points.length);
        for (let i = 0; i < lim; i++) {
          const p = idx.points[i];
          const sub = '层 ' + g.floorDisp(p.floor) + (p.desc ? ' · ' + U.escapeHtml(U.truncate(p.desc, 8)) : '');
          items.push(
            '<button class="pick-item" data-pick-type="p" data-pick-id="' +
              p.id +
              '"><span class="pick-dot" style="background:' +
              U.escapeHtml(p.color) +
              '"></span><span class="pick-label">#' +
              g.pointDisp(p.id) +
              '</span><span class="pick-sub">' +
              sub +
              '</span></button>'
          );
        }
        groups.push(this.pickGroupHtml('节点', idx.points.length, items, idx.points.length > cap));
      }
      if (idx.edges.length) {
        const items = [];
        const lim = Math.min(cap, idx.edges.length);
        for (let i = 0; i < lim; i++) {
          const e = idx.edges[i];
          const a = g.points.get(e.a);
          const b = g.points.get(e.b);
          const cross = a && b && a.floor !== b.floor;
          const sub = cross ? '跨层' : '层 ' + (a ? g.floorDisp(a.floor) : '?');
          items.push(
            '<button class="pick-item" data-pick-type="e" data-pick-id="' +
              e.id +
              '"><span class="pick-dot" style="background:' +
              U.escapeHtml(e.color) +
              '"></span><span class="pick-label">' +
              g.pointDisp(e.a) +
              (e.directed ? ' → ' : ' — ') +
              g.pointDisp(e.b) +
              '</span><span class="pick-sub">' +
              sub +
              '</span></button>'
          );
        }
        groups.push(this.pickGroupHtml('边', idx.edges.length, items, idx.edges.length > cap));
      }
      if (idx.floors.length) {
        const items = [];
        const lim = Math.min(cap, idx.floors.length);
        for (let i = 0; i < lim; i++) {
          const f = idx.floors[i];
          const count = (idx.byFloor.get(f.id) || []).length;
          const sub = f.desc ? U.escapeHtml(U.truncate(f.desc, 10)) : count + ' 点';
          items.push(
            '<button class="pick-item" data-pick-type="f" data-pick-id="' +
              f.id +
              '"><span class="pick-dot" style="background:' +
              U.escapeHtml(f.color || U.DEFAULT_LAYER_COLOR) +
              '"></span><span class="pick-label">层 ' +
              g.floorDisp(f.id) +
              '</span><span class="pick-sub">' +
              sub +
              '</span></button>'
          );
        }
        groups.push(this.pickGroupHtml('层', idx.floors.length, items, idx.floors.length > cap));
      }
      return (
        hint +
        toggle +
        '<div class="pick-body">' +
        (groups.length ? groups.join('') : '<div class="muted small">图中还没有对象。</div>') +
        '</div>'
      );
    },

    refreshFloors: function (app) {
      const g = app.graph;
      const idx = g.getIndex();
      const list = this.els.floorList;
      if (!idx.floors.length) {
        list.innerHTML = '<div class="muted small">暂无层</div>';
        return;
      }
      let start = 0;
      let end = idx.floors.length;
      let prefix = '';
      let suffix = '';
      if (idx.floors.length > 400) {
        const center = idx.floors.findIndex((f) => f.id === app.view.currentFloor);
        start = Math.max(0, center - 25);
        end = Math.min(idx.floors.length, start + 52);
        if (start > 0) prefix = '<div class="floor-more">… 上方的 ' + start + ' 层请用底部滑条切换</div>';
        if (end < idx.floors.length) suffix = '<div class="floor-more">… 下方的 ' + (idx.floors.length - end) + ' 层请用底部滑条切换</div>';
      }
      const rows = [];
      for (let i = start; i < end; i++) {
        const f = idx.floors[i];
        const count = (idx.byFloor.get(f.id) || []).length;
        const active = f.id === app.view.currentFloor;
        const selected = app.sel.has('f:' + f.id);
        rows.push(
          '<div class="floor-row' +
            (active ? ' is-active' : '') +
            (selected ? ' is-selected' : '') +
            (f.visible ? '' : ' is-hidden-floor') +
            '" data-fid="' +
            f.id +
            '">' +
            '<button class="floor-eye" data-eye="1" title="' +
            (f.visible ? '隐藏该层（3D 中生效）' : '显示该层') +
            '">' +
            icon(f.visible ? 'eye' : 'eyeOff') +
            '</button>' +
            '<span class="floor-swatch" style="background:' +
            (f.color || U.DEFAULT_LAYER_COLOR) +
            '"></span>' +
            '<span class="floor-name">层 ' +
            g.floorDisp(f.id) +
            '</span>' +
            '<span class="floor-desc">' +
            (f.desc ? U.escapeHtml(f.desc) : '') +
            '</span>' +
            '<span class="floor-meta">' +
            count +
            ' 点</span></div>'
        );
      }
      list.innerHTML = prefix + rows.join('') + suffix;
      const cur = list.querySelector('.floor-row.is-active');
      if (cur && list.scrollHeight > list.clientHeight) {
        const top = cur.offsetTop - list.clientHeight / 2;
        if (Math.abs(list.scrollTop - top) > 10) list.scrollTop = Math.max(0, top);
      }
    },

    updateToolbar: function (app) {
      if (!this.els.toolbar) return;
      const set = (id, disabled, active, label) => {
        const btn = this.els.toolbar.querySelector('[data-tool="' + id + '"]');
        if (!btn) return;
        btn.disabled = !!disabled;
        btn.classList.toggle('is-active', !!active);
        if (label) {
          btn.title = label;
          btn.setAttribute('aria-label', label);
        }
      };
      set('undo', !app.history.canUndo(), false, app.history.canUndo() ? '撤销：' + app.history.undoLabel() : '撤销');
      set('redo', !app.history.canRedo(), false, app.history.canRedo() ? '重做：' + app.history.redoLabel() : '重做');
      set('copy', !app.sel.size, false);
      set('cut', !app.sel.size, false);
      set('delete', !app.sel.size, false, '删除选中' + (app.sel.size ? '（' + app.sel.size + ' 个对象）' : ''));
      set('paste', !app.clipboard || !app.clipboard.points.length, false);
      set('gather', app.graph.points.size === 0, false, '收拢（压缩节点布局）');
      set('physics', false, app.view.physics, '物理效果：' + (app.view.physics ? '开' : '关'));
      set('grid', false, app.view.showGrid, '网格：' + (app.view.showGrid ? '开' : '关'));
      set('mode', false, app.view.mode === '3d', app.view.mode === '3d' ? '切换为分层显示' : '切换为 3D 多层显示');
      set('reset', app.view.mode === '2d', false, '回正视角（仅 3D）');
    },

    updateLayerBar: function (app) {
      const idx = app.graph.getIndex();
      const bar = this.els.layerBar;
      const show = idx.floors.length > 1;
      bar.classList.toggle('is-hidden', !show);
      if (!show) return;
      const rank = idx.floors.findIndex((f) => f.id === app.view.currentFloor);
      const safeRank = rank < 0 ? 0 : rank;
      const slider = this.els.floorSlider;
      slider.max = String(idx.floors.length - 1);
      if (document.activeElement !== slider) slider.value = String(safeRank);
      const input = this.els.floorInput;
      if (document.activeElement !== input) {
        input.value = String(app.graph.floorDisp(app.view.currentFloor));
        input.min = String(app.graph.settings.floorStart);
        input.max = String(app.graph.settings.floorStart + idx.floors.length - 1);
      }
      const current = app.graph.floors.get(app.view.currentFloor);
      const descEl = this.els.floorCurrentDesc;
      if (descEl) {
        const desc = current && current.desc ? current.desc : '';
        descEl.textContent = desc ? U.truncate(desc, 16) : '';
        descEl.title = desc;
        descEl.style.display = desc ? '' : 'none';
      }
      this.els.floorTotal.textContent = '/ ' + idx.floors.length;
    },

    updateHud: function (app) {
      if (!this.els.hud) return;
      const st = app.graph.stats();
      const sel = app.sel.size;
      const zoom = app.view.mode === '3d' ? app.view.orbit.dist : app.view.cam.scale;
      const parts = [];
      parts.push('<span class="hud-item">点 <b>' + U.formatInt(st.points) + '</b></span>');
      parts.push('<span class="hud-item">边 <b>' + U.formatInt(st.edges) + '</b></span>');
      parts.push('<span class="hud-item">层 <b>' + U.formatInt(st.floors) + '</b></span>');
      if (sel) parts.push('<span class="hud-item hud-sel">选中 <b>' + sel + '</b></span>');
      parts.push(
        '<span class="hud-item">' +
          (app.view.mode === '3d' ? '3D' : '2D') +
          ' · ' +
          (app.view.mode === '3d' ? Math.round(zoom) + 'u' : Math.round(zoom * 100) + '%') +
          '</span>'
      );
      parts.push('<span class="hud-item hud-fps">' + app.fps + ' fps</span>');
      this.els.hud.innerHTML = parts.join('');
      if (app.view.mode === '3d') {
        this.els.hud.title = '中键拖动旋转视角，右键拖动平移，滚轮缩放';
      } else {
        this.els.hud.title = '滚轮缩放，右键拖动平移';
      }
    },

    /* ------------------------------------------------------------ *
     * tabs & text
     * ------------------------------------------------------------ */

    switchTab: function (name) {
      const app = this.app;
      if (name === 'ui' && this.els.paneText && !this.els.paneText.classList.contains('is-hidden')) {
        app.onTextBlur();
        if (app.textError) this.toast('文本存在第 ' + app.textError.line + ' 行错误，正在显示上一份有效图', 'warn');
      }
      this.els.tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
      this.els.paneUI.classList.toggle('is-hidden', name !== 'ui');
      this.els.paneText.classList.toggle('is-hidden', name !== 'text');
      if (name === 'text') {
        if (!app.textError && !app._textDirty) app.syncText(true);
        this.textArea.focus();
      }
    },

    setText: function (text) {
      if (!this.textArea) return;
      if (this.textArea.value !== text) this.textArea.value = text;
    },

    getText: function () {
      return this.textArea ? this.textArea.value : '';
    },

    showTextError: function (err) {
      if (!this.textStatus) return;
      this.textStatus.className = 'text-status is-error';
      this.textStatus.innerHTML =
        '<span>第 ' +
        err.line +
        ' 行：' +
        U.escapeHtml(err.message) +
        '</span><button class="link-btn" data-line="' +
        err.line +
        '">定位</button>';
    },

    showTextHint: function (msg) {
      if (!this.textStatus) return;
      this.textStatus.className = 'text-status is-hint';
      this.textStatus.textContent = msg || '';
    },

    clearTextNotice: function () {
      if (!this.textStatus) return;
      this.textStatus.className = 'text-status';
      this.textStatus.textContent = '';
    },

    selectLine: function (n) {
      const ta = this.textArea;
      if (!ta) return;
      const lines = ta.value.split('\n');
      const line = U.clamp(n - 1, 0, lines.length - 1);
      let start = 0;
      for (let i = 0; i < line; i++) start += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(start, start + (lines[line] || '').length);
    },

    /* ------------------------------------------------------------ *
     * toast / tooltip
     * ------------------------------------------------------------ */

    toast: function (message, kind) {
      if (!this.els.toastWrap) return;
      const el = document.createElement('div');
      el.className = 'toast' + (kind === 'error' ? ' is-error' : kind === 'warn' ? ' is-warn' : '');
      el.textContent = message;
      this.els.toastWrap.appendChild(el);
      while (this.els.toastWrap.children.length > 4) this.els.toastWrap.removeChild(this.els.toastWrap.firstChild);
      setTimeout(() => {
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 220);
      }, 2600);
    },

    showTip: function (app, hit, clientX, clientY) {
      if (!hit) {
        this.hideTip();
        return;
      }
      const g = app.graph;
      let html = '';
      if (hit.type === 'point') {
        const p = g.points.get(hit.id);
        if (!p) return this.hideTip();
        html =
          '<div class="tip-title">节点 #' +
          g.pointDisp(p.id) +
          '</div><div class="tip-sub">第 ' +
          g.floorDisp(p.floor) +
          ' 层 · 度数 ' +
          g.degree(p.id) +
          '</div>';
        if (p.weight != null) html += '<div class="tip-row">点权：' + U.escapeHtml(U.weightText(p.weight)) + '</div>';
        if (p.desc) html += '<div class="tip-row">描述：' + U.escapeHtml(p.desc) + '</div>';
        html += '<div class="tip-row">颜色：' + p.color + '</div>';
      } else if (hit.type === 'edge') {
        const e = g.edges.get(hit.id);
        if (!e) return this.hideTip();
        const a = g.points.get(e.a);
        const b = g.points.get(e.b);
        html =
          '<div class="tip-title">' +
          (e.directed ? '有向边' : '无向边') +
          ' ' +
          g.pointDisp(e.a) +
          (e.directed ? ' → ' : ' — ') +
          g.pointDisp(e.b) +
          '</div>';
        if (a && b) {
          html +=
            '<div class="tip-sub">第 ' +
            g.floorDisp(a.floor) +
            ' 层' +
            (a.floor !== b.floor ? ' ⇢ 第 ' + g.floorDisp(b.floor) + ' 层' : '') +
            '</div>';
        }
        if (e.weight != null) html += '<div class="tip-row">边权：' + U.escapeHtml(U.weightText(e.weight)) + '</div>';
        if (e.desc) html += '<div class="tip-row">描述：' + U.escapeHtml(e.desc) + '</div>';
        html += '<div class="tip-row">颜色：' + e.color + '</div>';
      } else if (hit.type === 'floor') {
        const f = g.floors.get(hit.id);
        if (!f) return this.hideTip();
        const idx = g.getIndex();
        const count = (idx.byFloor.get(f.id) || []).length;
        html =
          '<div class="tip-title">层 ' +
          g.floorDisp(f.id) +
          '</div><div class="tip-sub">' +
          (f.visible ? '可见' : '隐藏（3D）') +
          ' · ' +
          count +
          ' 个节点</div>';
        if (f.desc) html += '<div class="tip-row">描述：' + U.escapeHtml(f.desc) + '</div>';
      }
      if (!html) return this.hideTip();
      this.els.tip.innerHTML = html;
      this.els.tip.classList.add('is-visible');
      this.positionTip(clientX, clientY);
    },

    positionTip: function (clientX, clientY) {
      const stage = this.els.stage.getBoundingClientRect();
      const tip = this.els.tip;
      const w = tip.offsetWidth || 220;
      const h = tip.offsetHeight || 80;
      let x = clientX - stage.left + 16;
      let y = clientY - stage.top + 18;
      if (x + w > stage.width - 12) x = clientX - stage.left - w - 14;
      if (y + h > stage.height - 12) y = clientY - stage.top - h - 14;
      tip.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
    },

    hideTip: function () {
      if (this.els.tip) this.els.tip.classList.remove('is-visible');
    },

    /* ------------------------------------------------------------ *
     * modal infrastructure
     * ------------------------------------------------------------ */

    modal: function (opts) {
      opts = opts || {};
      const root = this.els.modalRoot;
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      const dialog = document.createElement('div');
      dialog.className = 'modal' + (opts.wide ? ' modal-wide' : '') + (opts.xwide ? ' modal-xwide' : '');
      if (opts.width) dialog.style.maxWidth = opts.width;

      const head = document.createElement('div');
      head.className = 'modal-head';
      head.innerHTML = '<h2>' + U.escapeHtml(opts.title || '') + '</h2>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'icon-btn modal-close';
      closeBtn.innerHTML = icon('close');
      closeBtn.title = '关闭';
      head.appendChild(closeBtn);

      const body = document.createElement('div');
      body.className = 'modal-body';
      if (typeof opts.body === 'string') body.innerHTML = opts.body;
      else if (opts.body) body.appendChild(opts.body);

      dialog.appendChild(head);
      dialog.appendChild(body);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.add('is-leaving');
        this.modalCount = Math.max(0, this.modalCount - 1);
        setTimeout(() => backdrop.remove(), 160);
        if (opts.onClose) opts.onClose();
      };

      const footer = document.createElement('div');
      footer.className = 'modal-foot';
      const actions = opts.actions || [{ label: '关闭', kind: 'ghost' }];
      actions.forEach((action, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (action.kind === 'primary' ? 'btn-primary' : action.kind === 'danger' ? 'btn-danger' : action.kind === 'ghost' ? 'btn-ghost' : '');
        btn.textContent = action.label;
        if (index === actions.length - 1 && action.enter !== false) btn.setAttribute('data-enter', 'true');
        btn.addEventListener('click', () => {
          const r = action.onClick ? action.onClick(close, dialog, body) : undefined;
          if (r === false || action.keepOpen) return;
          close();
        });
        footer.appendChild(btn);
      });
      dialog.appendChild(footer);

      const onKey = (e) => {
        const open = root.querySelectorAll('.modal-backdrop');
        if (open.length && open[open.length - 1] !== backdrop) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        } else if (e.key === 'Enter') {
          const tag = (e.target && e.target.tagName) || '';
          if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
          const enterBtn = footer.querySelector('[data-enter="true"]');
          if (enterBtn) {
            e.preventDefault();
            enterBtn.click();
          }
        }
      };
      document.addEventListener('keydown', onKey, true);
      closeBtn.addEventListener('click', close);
      backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop && opts.dismissible !== false) close();
      });
      backdrop.appendChild(dialog);
      root.appendChild(backdrop);
      this.modalCount++;
      requestAnimationFrame(() => backdrop.classList.add('is-in'));
      const first = body.querySelector('input, select, textarea, button');
      if (first && opts.focus !== false) setTimeout(() => first.focus(), 40);
      return { close: close, dialog: dialog, body: body, footer: footer };
    },

    confirm: function (opts) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (v) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };
        const m = this.modal({
          title: opts.title || '确认',
          body: '<p class="confirm-text">' + U.escapeHtml(opts.message || '') + '</p>',
          actions: [
            { label: '取消', kind: 'ghost', onClick: () => finish(false) },
            {
              label: opts.confirmLabel || '确定',
              kind: opts.danger ? 'danger' : 'primary',
              onClick: () => finish(true),
            },
          ],
          onClose: () => finish(false),
        });
        void m;
      });
    },

    /* ------------------------------------------------------------ *
     * dialogs
     * ------------------------------------------------------------ */

    openNewEdge: function (app) {
      const g = app.graph;
      const info = app.selectionInfo();
      let preA = info.points[0] ? g.pointDisp(info.points[0].id) : '';
      let preB = info.points[1] ? g.pointDisp(info.points[1].id) : '';
      if (!preA) {
        const pts = g.getIndex().points;
        if (pts.length) preA = g.pointDisp(pts[0].id);
      }
      if (!preB) {
        const pts = g.getIndex().points;
        if (pts.length > 1) preB = g.pointDisp(pts[1].id);
      }
      const body =
        '<div class="form-error" data-error></div>' +
        '<div class="form-grid">' +
        fieldHtml('起点编号', '<input class="input" data-k="a" type="number" step="1" value="' + preA + '">') +
        fieldHtml('终点编号', '<input class="input" data-k="b" type="number" step="1" value="' + preB + '">') +
        '</div>' +
        fieldHtml('目标层级', '<div class="input input-static" data-k="layers">—</div>') +
        fieldHtml('类型', '<select class="input" data-k="directed"><option value="0"' +
          (app.lastEdgeDirected ? '' : ' selected') +
          '>无向边</option><option value="1"' +
          (app.lastEdgeDirected ? ' selected' : '') +
          '>有向边</option></select>') +
        fieldHtml('边权', '<input class="input" data-k="weight" placeholder="留空表示无；多维如 (1,2)">') +
        fieldHtml('颜色', '<input class="input input-color" data-k="color" type="color" value="#000000">') +
        fieldHtml('描述', '<input class="input" data-k="desc" placeholder="可留空">') +
        '<p class="form-note">点的编号是全局的，端点层级由编号自动确定，无需手动填写。</p>';
      const m = this.modal({
        title: '新建边',
        body: body,
        actions: [
          { label: '取消', kind: 'ghost' },
          { label: '创建', kind: 'primary', onClick: () => this.submitEdgeDialog(app, m, false) },
        ],
      });
      const aIn = m.body.querySelector('[data-k="a"]');
      const bIn = m.body.querySelector('[data-k="b"]');
      const layerView = m.body.querySelector('[data-k="layers"]');
      const sync = () => {
        const pa = g.points.get(g.pointIdFromDisp(Number(aIn.value)));
        const pb = g.points.get(g.pointIdFromDisp(Number(bIn.value)));
        if (pb) {
          const fb = g.floorDisp(pb.floor);
          if (pa && g.floorDisp(pa.floor) !== fb) {
            layerView.textContent = '第 ' + fb + ' 层（起点第 ' + g.floorDisp(pa.floor) + ' 层）';
          } else {
            layerView.textContent = '第 ' + fb + ' 层';
          }
        } else if (pa) {
          layerView.textContent = '起点：第 ' + g.floorDisp(pa.floor) + ' 层';
        } else {
          layerView.textContent = '—';
        }
      };
      aIn.addEventListener('input', sync);
      bIn.addEventListener('input', sync);
      sync();
    },

    submitEdgeDialog: function (app, modal, isEdit) {
      const g = app.graph;
      const body = modal.body;
      const errEl = body.querySelector('[data-error]');
      const showErr = (msg) => {
        if (errEl) {
          errEl.textContent = msg;
          errEl.classList.add('is-visible');
        }
        return false;
      };
      errEl.classList.remove('is-visible');
      const aDisp = Number(body.querySelector('[data-k="a"]').value);
      const bDisp = Number(body.querySelector('[data-k="b"]').value);
      const a = g.pointIdFromDisp(aDisp);
      const b = g.pointIdFromDisp(bDisp);
      if (a < 0) return showErr('起点编号 ' + aDisp + ' 不存在');
      if (b < 0) return showErr('终点编号 ' + bDisp + ' 不存在');
      const weightInput = body.querySelector('[data-k="weight"]');
      const w = U.parseWeight(weightInput.value);
      if (!w.ok) return showErr('边权格式错误：应为数字或 (a,b,...)');
      const color = body.querySelector('[data-k="color"]').value;
      const desc = body.querySelector('[data-k="desc"]').value.trim();
      const directed = body.querySelector('[data-k="directed"]').value === '1';
      if (isEdit) {
        const eid = isEdit.edgeId;
        app.transaction('编辑边', (mut) => {
          mut.updateEdge(eid, {
            a: a,
            b: b,
            directed: directed,
            weight: w.value,
            color: color,
            desc: desc,
          });
        });
      } else {
        const ok = app.newEdge({
          a: a,
          b: b,
          directed: directed,
          weight: w.value,
          color: color,
          desc: desc,
        });
        if (!ok) return showErr('创建失败，请检查数量上限');
      }
      return true;
    },

    openEditSelection: function (app) {
      const info = app.selectionInfo();
      const total = info.points.length + info.edges.length + info.floors.length;
      if (!total) {
        this.toast('请先选中对象', 'error');
        return;
      }
      if (total > 1) {
        const chips = [];
        for (const p of info.points.slice(0, 20)) chips.push('<span class="chip chip-point">#' + app.graph.pointDisp(p.id) + '</span>');
        for (const e of info.edges.slice(0, 20)) chips.push('<span class="chip chip-edge">' + app.graph.pointDisp(e.a) + (e.directed ? '→' : '—') + app.graph.pointDisp(e.b) + '</span>');
        for (const f of info.floors.slice(0, 20)) chips.push('<span class="chip chip-floor">层 ' + app.graph.floorDisp(f.id) + '</span>');
        this.modal({
          title: '已选中 ' + total + ' 个对象',
          body:
            '<p class="muted small">多选模式下暂不支持批量修改属性。可逐个双击编辑，或整体删除。</p><div class="sel-chips">' +
            chips.join('') +
            (total > 20 ? '<span class="chip-more">…</span>' : '') +
            '</div>',
          actions: [
            { label: '关闭', kind: 'ghost' },
            {
              label: '删除选中',
              kind: 'danger',
              enter: false,
              onClick: (close) => {
                close();
                app.deleteSelection();
              },
            },
          ],
        });
        return;
      }
      if (info.points.length === 1) this.openPointProps(app, info.points[0]);
      else if (info.edges.length === 1) this.openEdgeProps(app, info.edges[0]);
      else if (info.floors.length === 1) this.openFloorProps(app, info.floors[0].id);
    },

    openPointProps: function (app, p) {
      const g = app.graph;
      const body =
        '<div class="form-error" data-error></div>' +
        '<div class="form-grid">' +
        fieldHtml('节点编号', '<input class="input" value="' + g.pointDisp(p.id) + '" readonly>') +
        fieldHtml('所在层', floorOptions(app, p.floor)) +
        '</div>' +
        fieldHtml('点权', '<input class="input" data-k="weight" value="' + U.escapeHtml(p.weight != null ? U.weightText(p.weight) : '') + '" placeholder="留空表示无；多维如 (1,2)">') +
        fieldHtml('颜色', '<input class="input input-color" data-k="color" type="color" value="' + U.escapeHtml(p.color) + '">') +
        fieldHtml('描述', '<input class="input" data-k="desc" value="' + U.escapeHtml(p.desc || '') + '" placeholder="可留空">') +
        '<p class="form-note">修改层级会把节点移动到目标层；与相邻层连接的边会自动变为跨层边。</p>';
      const m = this.modal({
        title: '节点 #' + g.pointDisp(p.id),
        body: body,
        actions: [
          {
            label: '删除节点',
            kind: 'danger',
            onClick: (close) => {
              close();
              app.deleteSelection();
            },
          },
          { label: '取消', kind: 'ghost' },
          {
            label: '保存',
            kind: 'primary',
            onClick: () => {
              const errEl = m.body.querySelector('[data-error]');
              const w = U.parseWeight(m.body.querySelector('[data-k="weight"]').value);
              if (!w.ok) {
                errEl.textContent = '点权格式错误：应为数字或 (a,b,...)';
                errEl.classList.add('is-visible');
                return false;
              }
              const fid = g.floorIdFromDisp(Number(m.body.querySelector('.field select, .field input[type="number"]').value));
              if (fid < 0) {
                errEl.textContent = '层级不存在';
                errEl.classList.add('is-visible');
                return false;
              }
              const color = m.body.querySelector('[data-k="color"]').value;
              const desc = m.body.querySelector('[data-k="desc"]').value.trim();
              app.transaction('编辑节点', (mut) => {
                mut.updatePoint(p.id, { floor: fid, weight: w.value, color: color, desc: desc });
              });
              return true;
            },
          },
        ],
      });
    },

    openEdgeProps: function (app, e) {
      const g = app.graph;
      const a = g.points.get(e.a);
      const b = g.points.get(e.b);
      if (!a || !b) return;
      const body =
        '<div class="form-error" data-error></div>' +
        '<div class="form-grid">' +
        fieldHtml('起点编号', '<input class="input" data-k="a" type="number" step="1" value="' + g.pointDisp(e.a) + '">') +
        fieldHtml('终点编号', '<input class="input" data-k="b" type="number" step="1" value="' + g.pointDisp(e.b) + '">') +
        '</div>' +
        fieldHtml('目标层级', '<div class="input input-static" data-k="layers">—</div>') +
        fieldHtml('类型', '<select class="input" data-k="directed"><option value="0"' + (!e.directed ? ' selected' : '') + '>无向边</option><option value="1"' + (e.directed ? ' selected' : '') + '>有向边</option></select>') +
        fieldHtml('边权', '<input class="input" data-k="weight" value="' + U.escapeHtml(e.weight != null ? U.weightText(e.weight) : '') + '" placeholder="留空表示无；多维如 (1,2)">') +
        fieldHtml('颜色', '<input class="input input-color" data-k="color" type="color" value="' + U.escapeHtml(e.color) + '">') +
        fieldHtml('描述', '<input class="input" data-k="desc" value="' + U.escapeHtml(e.desc || '') + '" placeholder="可留空">') +
        '<p class="form-note">点的编号是全局的，端点层级由编号自动确定，无需手动填写。</p>';
      const m = this.modal({
        title: '边 ' + g.pointDisp(e.a) + (e.directed ? ' → ' : ' — ') + g.pointDisp(e.b),
        body: body,
        actions: [
          {
            label: '删除边',
            kind: 'danger',
            onClick: (close) => {
              close();
              app.deleteSelection();
            },
          },
          { label: '取消', kind: 'ghost' },
          {
            label: '保存',
            kind: 'primary',
            onClick: () => this.submitEdgeDialog(app, m, { edgeId: e.id }),
          },
        ],
      });
      const aIn = m.body.querySelector('[data-k="a"]');
      const bIn = m.body.querySelector('[data-k="b"]');
      const layerView = m.body.querySelector('[data-k="layers"]');
      const sync = () => {
        const pa = g.points.get(g.pointIdFromDisp(Number(aIn.value)));
        const pb = g.points.get(g.pointIdFromDisp(Number(bIn.value)));
        if (pb) {
          const fb = g.floorDisp(pb.floor);
          if (pa && g.floorDisp(pa.floor) !== fb) {
            layerView.textContent = '第 ' + fb + ' 层（起点第 ' + g.floorDisp(pa.floor) + ' 层）';
          } else {
            layerView.textContent = '第 ' + fb + ' 层';
          }
        } else if (pa) {
          layerView.textContent = '起点：第 ' + g.floorDisp(pa.floor) + ' 层';
        } else {
          layerView.textContent = '—';
        }
      };
      aIn.addEventListener('input', sync);
      bIn.addEventListener('input', sync);
      sync();
    },

    openFloorProps: function (app, fid) {
      const g = app.graph;
      const f = g.floors.get(fid);
      if (!f) return;
      const idx = g.getIndex();
      const count = (idx.byFloor.get(fid) || []).length;
      const body =
        '<div class="form-error" data-error></div>' +
        fieldHtml('层编号', '<input class="input" value="' + g.floorDisp(fid) + '" readonly>') +
        fieldHtml('节点数量', '<input class="input" value="' + count + '" readonly>') +
        fieldHtml('显示状态', '<select class="input" data-k="visible"><option value="1"' + (f.visible ? ' selected' : '') + '>显示（3D 中可见）</option><option value="0"' + (!f.visible ? ' selected' : '') + '>隐藏（3D 中不绘制，物理保留）</option></select>') +
        fieldHtml('主题色', '<input class="input input-color" data-k="color" type="color" value="' + U.escapeHtml(f.color || U.DEFAULT_LAYER_COLOR) + '">', '新建节点默认使用该颜色；不会改变已有节点颜色') +
        fieldHtml('层描述', '<input class="input" data-k="desc" value="' + U.escapeHtml(f.desc || '') + '" placeholder="可留空">');
      const m = this.modal({
        title: '层 ' + g.floorDisp(fid),
        body: body,
        actions: [
          {
            label: '删除层',
            kind: 'danger',
            onClick: (close) => {
              if (g.floors.size <= 1) {
                this.toast('至少需要保留一层', 'error');
                return false;
              }
              close();
              app.sel = new Set(['f:' + fid]);
              app.selectionChanged();
              app.deleteSelection();
            },
          },
          { label: '取消', kind: 'ghost' },
          {
            label: '保存',
            kind: 'primary',
            onClick: () => {
              const visible = m.body.querySelector('[data-k="visible"]').value === '1';
              const desc = m.body.querySelector('[data-k="desc"]').value.trim();
              const color = m.body.querySelector('[data-k="color"]').value;
              app.transaction('编辑层', (mut) => {
                mut.updateFloor(fid, { visible: visible, desc: desc, color: color });
              });
              return true;
            },
          },
        ],
      });
    },

    openExport: function (app) {
      const body =
        '<div class="form-grid">' +
        fieldHtml('格式', '<select class="input" data-k="format"><option value="png">PNG</option><option value="jpeg">JPEG</option></select>') +
        fieldHtml('范围', '<select class="input" data-k="range"><option value="all">全部内容（自动适应）</option><option value="view">当前视口</option></select>') +
        fieldHtml('分辨率', '<select class="input" data-k="scale"><option value="1">1x</option><option value="2" selected>2x</option><option value="3">3x</option><option value="4">4x</option></select>') +
        fieldHtml('文件名', '<input class="input" data-k="filename" value="graph-' + U.timestamp() + '">') +
        '</div>' +
        '<div class="check-row"><label><input type="checkbox" data-k="grid"> 包含网格</label><label><input type="checkbox" data-k="hidden"> 包含隐藏层（3D）</label><label><input type="checkbox" data-k="bg" checked> 填充背景</label></div>' +
        fieldHtml('背景颜色', '<input class="input input-color" data-k="bgcolor" type="color" value="#ffffff">') +
        '<p class="form-note">默认不包含网格与隐藏层。JPEG 始终使用不透明背景；PNG 可取消“填充背景”以获得透明底。</p>';
      const m = this.modal({
        title: '导出图片',
        body: body,
        actions: [
          { label: '取消', kind: 'ghost' },
          {
            label: '导出',
            kind: 'primary',
            onClick: () => {
              const q = (k) => m.body.querySelector('[data-k="' + k + '"]');
              const format = q('format').value;
              const bg = q('bg').checked;
              app.exportImage({
                format: format,
                range: q('range').value,
                scale: Number(q('scale').value),
                filename: q('filename').value.trim() || 'graph-' + U.timestamp(),
                includeGrid: q('grid').checked,
                includeHidden: q('hidden').checked,
                transparent: !bg,
                bgColor: q('bgcolor').value,
              });
              return true;
            },
          },
        ],
      });
      const formatSel = m.body.querySelector('[data-k="format"]');
      const bgCheck = m.body.querySelector('[data-k="bg"]');
      const update = () => {
        m.body.querySelector('[data-k="bgcolor"]').disabled = !bgCheck.checked;
      };
      formatSel.addEventListener('change', update);
      bgCheck.addEventListener('change', update);
      update();
    },

    openGuide: function () {
      const body =
        '<div class="guide">' +
        '<section><h3>画布操作</h3><ul>' +
        '<li>滚轮：以光标为中心缩放。</li>' +
        '<li>右键拖动：平移画布；中键拖动在 3D 模式下旋转视角（2D 中为平移）。</li>' +
        '<li>左键单击节点 / 边：选中；Shift + 单击：多选；在空白处拖动：框选。</li>' +
        '<li>拖动节点：带力导向物理效果，相邻节点弹性跟随，松手后继续运行；可在工具栏关闭物理效果。</li>' +
        '<li>双击节点、边或层编号：打开属性面板快速编辑。</li>' +
        '<li>分层模式下，跨层边显示为向本层外侧的虚线与对端层号，并绘制在普通边下方，不会遮挡原边；切换到 3D 即可看到完整连接。</li>' +
        '<li>左侧“偏好”可调整边粗细、点大小、层距，以及物理的斥力、阻尼、弹簧与边长；“恢复默认”会把这些偏好恢复为初始值。这些是画布偏好，不写入 TXT、不进入撤销历史。</li>' +
        '<li>工具栏“收拢”会把布局压缩到中心附近，适合物理参数过大导致节点飞散时使用；该操作可撤销。</li>' +
        '<li>未选中对象时，左侧“当前选中”提供默认折叠的“对象列表”；展开后按节点 / 边 / 层分组，点击即可选中并切换到对应层。</li>' +
        '<li>新建边会记住上一次选择的有向 / 无向类型；新建边的默认颜色仍为黑色。</li>' +
        '<li>隐藏层只在 3D 显示中隐藏，分层模式不受影响；隐藏层仍参与物理模拟。</li>' +
        '</ul></section>' +
        '<section><h3>快捷键</h3><ul>' +
        '<li><kbd>Ctrl</kbd> + <kbd>Z</kbd> 撤销；<kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> 重做</li>' +
        '<li><kbd>Ctrl</kbd> + <kbd>A</kbd> 全选；<kbd>Ctrl</kbd> + <kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> 复制 / 剪切 / 粘贴</li>' +
        '<li><kbd>Delete</kbd> 删除选中（需确认）；<kbd>Esc</kbd> 关闭弹窗 / 取消操作</li>' +
        '<li><kbd>Enter</kbd> 在弹窗中确认 / 创建 / 保存（焦点在输入框或弹窗内时均可）</li>' +
        '<li><kbd>F</kbd> 适应视图；<kbd>G</kbd> 切换网格；<kbd>P</kbd> 切换物理；<kbd>3</kbd> 切换 2D / 3D</li>' +
        '</ul></section>' +
        '<section><h3>TXT 文档语法</h3>' +
        '<pre>#pointnumber 1 #floornumber 1\n' +
        'N M [F]\n' +
        '起点 终点 [起点层 终点层] 方向 [边权] [颜色] [描述]\n' +
        '...（共 M 行）\n' +
        'P [点权] [层级] [颜色] [描述]\n' +
        '...（共 N 行，可整体省略）\n' +
        'F [0|1] [#层颜色] [描述]\n' +
        '...（共 F 行，可整体省略）</pre>' +
        '<ul>' +
        '<li>首行：点数、边数、层数；只有一层时可省略层数。</li>' +
        '<li>编号默认 1 起点。可用首行前的 <code>#pointnumber 0|1</code>、<code>#floornumber 0|1</code> 修改。</li>' +
        '<li>方向：0 无向，1 有向（必须写）。边权 / 点权支持多维 <code>(1,2,3)</code>；颜色为 <code>#RGB</code> 或 <code>#RRGGBB</code>，可省略（默认黑色）。</li>' +
        '<li>描述在行末，可包含空格与中文；超过 5 个字符时画布上显示省略号。层描述会显示在层级编号旁边。</li>' +
        '<li>层主题色默认为蓝色 <code>#2563eb</code>；在 UI 中新建节点时默认使用该层主题色，已有节点不会被重新着色。新建边仍默认黑色；TXT 中省略点颜色时仍按原规范使用黑色。</li>' +
        '<li>边行可以引用后面才声明的点与层。多层时点的层级必须与边行中的层号一致。</li>' +
        '<li>文本会边输入边解析：写到一半的行不会报错；语法错误会显示行号并保留上一份有效图。失焦时会做一次严格校验。</li>' +
        '<li>UI 改动会实时重写文本；文本解析成功后会同步更新画布。注意：当描述以数字或颜色（# 开头）开头且权值为空时，文本格式本身存在歧义；层描述以 0/1 开头时会优先被当作可见性标记，以颜色 token 开头时会被当作层主题色。建议同时写出权值或调整描述。</li>' +
        '</ul></section>' +
        '<section><h3>数量上限</h3><ul><li>点：10,000；边：1,000,000；层：10,000。</li>' +
        '<li>节点数少于 100 时保持流畅；规模较大时渲染与物理会自动降级（标签分级显示、边采样模拟）。</li></ul></section>' +
        '<section><h3>复制 / 粘贴</h3><ul>' +
        '<li>复制以节点为单位，同时复制“两端都在选中集合内”的边；粘贴会生成新编号并整体偏移，跨层复制保留层归属，目标层不存在时放入当前层。</li>' +
        '<li>删除节点会一并删除相连的边；删除层会一并删除层内节点与相连边，且至少保留一层。</li>' +
        '</ul></section>' +
        '<section><h3>制作人员</h3><ul>' +
        '<li>作者：yihang_su</li>' +
        '<li>Github：<a href="https://github.com/yihang13" target="_blank" rel="noopener noreferrer">yihang13</a></li>' +
        '<li>本项目 Github 地址：<a href="https://github.com/yihang13/Graph-Editor" target="_blank" rel="noopener noreferrer">https://github.com/yihang13/Graph-Editor</a></li>' +
        '</ul><p class="guide-thanks">如果您觉得本项目对您有帮助，不妨在 Github 上为我们点亮 Star，谢谢！</p></section>' +
        '</div>';
      this.modal({
        title: '操作指南',
        wide: true,
        body: body,
        actions: [{ label: '知道了', kind: 'primary' }],
      });
    },
  };

  GE.UI = UI;
})(globalThis.GE = globalThis.GE || {});
