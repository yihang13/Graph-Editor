/* Graph Editor - TXT document parser & serializer
 *
 * Document grammar (tolerant while typing, strict when `final`):
 *   [#pointnumber 0|1 [#floornumber 0|1]]
 *   N M [F]
 *   M edge lines : a b [fa fb] dir [weight] [color] [desc...]
 *   N point lines: P [weight] [floor] [color] [desc...]
 *   F floor lines: F [0|1] [desc...]
 */
(function (GE) {
  'use strict';

  const U = GE.U;

  function tokenize(line) {
    const tokens = [];
    let i = 0;
    const n = line.length;
    while (i < n) {
      const c = line.charAt(i);
      if (c === ' ' || c === '\t') {
        i++;
        continue;
      }
      const start = i;
      while (i < n) {
        const ch = line.charAt(i);
        if (ch === ' ' || ch === '\t') break;
        i++;
      }
      tokens.push({ text: line.slice(start, i), start: start, end: i });
    }
    return tokens;
  }

  function firstToken(line) {
    const t = tokenize(line);
    return t.length ? t[0].text : '';
  }

  function restOfLine(line, tokens, idx) {
    if (idx >= tokens.length) return '';
    return line.slice(tokens[idx].start).replace(/[ \t]+$/, '');
  }

  function parseEdgeLine(line, li, ctx) {
    const toks = tokenize(line);
    const need = ctx.floorCount > 1 ? 5 : 3;
    if (toks.length < need) {
      return {
        missing: true,
        message:
          '边行内容不足，至少需要 ' +
          need +
          ' 个字段：起点 终点' +
          (ctx.floorCount > 1 ? ' 起点层 终点层' : '') +
          ' 方向',
      };
    }
    let i = 0;
    const aTok = toks[i++].text;
    const bTok = toks[i++].text;
    if (!U.isIntToken(aTok) || !U.isIntToken(bTok)) {
      return { error: '边的起点与终点编号必须是整数' };
    }
    const aDisp = U.int(aTok);
    const bDisp = U.int(bTok);
    if (aDisp < ctx.pointStart || aDisp > ctx.pointStart + ctx.pointCount - 1) {
      return { error: '起点编号 ' + aDisp + ' 超出范围（应为 ' + ctx.pointStart + ' ~ ' + (ctx.pointStart + ctx.pointCount - 1) + '）' };
    }
    if (bDisp < ctx.pointStart || bDisp > ctx.pointStart + ctx.pointCount - 1) {
      return { error: '终点编号 ' + bDisp + ' 超出范围（应为 ' + ctx.pointStart + ' ~ ' + (ctx.pointStart + ctx.pointCount - 1) + '）' };
    }
    const a = aDisp - ctx.pointStart;
    const b = bDisp - ctx.pointStart;

    let fA = ctx.singleFloor ? 0 : -1;
    let fB = ctx.singleFloor ? 0 : -1;
    let fADisp = 0;
    let fBDisp = 0;
    if (ctx.floorCount > 1) {
      const faTok = toks[i++].text;
      const fbTok = toks[i++].text;
      if (!U.isIntToken(faTok) || !U.isIntToken(fbTok)) {
        return { error: '起点层与终点层的层号必须是整数' };
      }
      fADisp = U.int(faTok);
      fBDisp = U.int(fbTok);
      if (fADisp < ctx.floorStart || fADisp > ctx.floorStart + ctx.floorCount - 1) {
        return { error: '起点层号 ' + fADisp + ' 超出范围（应为 ' + ctx.floorStart + ' ~ ' + (ctx.floorStart + ctx.floorCount - 1) + '）' };
      }
      if (fBDisp < ctx.floorStart || fBDisp > ctx.floorStart + ctx.floorCount - 1) {
        return { error: '终点层号 ' + fBDisp + ' 超出范围（应为 ' + ctx.floorStart + ' ~ ' + (ctx.floorStart + ctx.floorCount - 1) + '）' };
      }
      fA = fADisp - ctx.floorStart;
      fB = fBDisp - ctx.floorStart;
    }

    const dirTok = toks[i++].text;
    if (!U.isIntToken(dirTok)) return { error: '方向标记必须是 0（无向）或 1（有向）' };
    const dirNum = U.int(dirTok);
    if (dirNum !== 0 && dirNum !== 1) return { error: '方向标记必须是 0（无向）或 1（有向）' };

    let weight = null;
    if (i < toks.length) {
      const t = toks[i].text;
      if (t.charAt(0) === '(' || U.isNumberToken(t)) {
        const w = U.parseWeight(t);
        if (!w.ok) return { error: '边权格式错误：应为整数、浮点数或 (a,b,...) 形式' };
        weight = w.value;
        i++;
      }
    }
    let color = '#000000';
    if (i < toks.length && U.isColorToken(toks[i].text)) {
      color = U.normColor(toks[i].text);
      i++;
    }
    const desc = restOfLine(line, toks, i);

    const pa = ctx.graph.points.get(a);
    const pb = ctx.graph.points.get(b);
    if (!pa || !pb) return { error: '起点或终点不存在' };
    if (ctx.floorCount > 1) {
      if (pa.floor === -1) pa.floor = fA;
      else if (pa.floor !== fA) {
        return { error: '节点 ' + aDisp + ' 的层级与文中已声明的不一致（第 ' + ctx.graph.floorDisp(pa.floor) + ' 层 vs 第 ' + fADisp + ' 层）' };
      }
      if (pb.floor === -1) pb.floor = fB;
      else if (pb.floor !== fB) {
        return { error: '节点 ' + bDisp + ' 的层级与文中已声明的不一致（第 ' + ctx.graph.floorDisp(pb.floor) + ' 层 vs 第 ' + fBDisp + ' 层）' };
      }
    }

    ctx.graph.insertEdge({
      id: ctx.graph.allocEdgeId(),
      a: a,
      b: b,
      directed: dirNum === 1,
      weight: weight,
      color: color,
      desc: desc,
    });
    return { ok: true };
  }

  function parsePointLine(line, li, ctx, idx) {
    const toks = tokenize(line);
    if (!toks.length || toks[0].text !== 'P') return { error: '点属性行必须以 P 开头' };
    let i = 1;
    let weight = null;
    let floorDisp = null;
    let floorInternal = -1;

    if (ctx.floorCount > 1) {
      if (i >= toks.length) return { missing: true, message: '缺少点的层级' };
      const t = toks[i].text;
      if (t.charAt(0) === '(') {
        const w = U.parseWeight(t);
        if (!w.ok) return { error: '点权格式错误：应为整数、浮点数或 (a,b,...) 形式' };
        weight = w.value;
        i++;
        if (i >= toks.length) return { missing: true, message: '缺少点的层级' };
        if (!U.isIntToken(toks[i].text)) return { error: '点的层级必须是整数' };
        floorDisp = U.int(toks[i].text);
        i++;
      } else if (U.isNumberToken(t)) {
        if (i + 1 < toks.length && U.isIntToken(toks[i + 1].text)) {
          weight = Number(t);
          floorDisp = U.int(toks[i + 1].text);
          i += 2;
        } else {
          floorDisp = U.int(t);
          i += 1;
        }
      } else if (U.isColorToken(t)) {
        return { error: '缺少点的层级' };
      } else {
        return { error: '缺少点的层级或点权格式错误' };
      }
      if (ctx.floorStart > floorDisp || floorDisp > ctx.floorStart + ctx.floorCount - 1) {
        return { error: '点的层号 ' + floorDisp + ' 超出范围（应为 ' + ctx.floorStart + ' ~ ' + (ctx.floorStart + ctx.floorCount - 1) + '）' };
      }
      floorInternal = floorDisp - ctx.floorStart;
    } else {
      floorDisp = ctx.floorStart;
      floorInternal = 0;
      if (i < toks.length) {
        const t = toks[i].text;
        if (t.charAt(0) === '(' || U.isNumberToken(t)) {
          const w = U.parseWeight(t);
          if (!w.ok) return { error: '点权格式错误：应为整数、浮点数或 (a,b,...) 形式' };
          weight = w.value;
          i++;
        }
      }
    }

    let color = '#000000';
    if (i < toks.length && U.isColorToken(toks[i].text)) {
      color = U.normColor(toks[i].text);
      i++;
    }
    const desc = restOfLine(line, toks, i);

    const p = ctx.graph.points.get(idx);
    if (!p) return { error: '点属性行数量超出点的总数' };
    if (ctx.floorCount > 1) {
      if (p.floor === -1) p.floor = floorInternal;
      else if (p.floor !== floorInternal) {
        return { error: '节点 ' + (idx + ctx.pointStart) + ' 的层级与边行中声明的不一致（第 ' + ctx.graph.floorDisp(p.floor) + ' 层 vs 第 ' + floorDisp + ' 层）' };
      }
    }
    p.weight = weight;
    p.color = color;
    p.desc = desc;
    return { ok: true };
  }

  function parseFloorLine(line, li, ctx, idx) {
    const toks = tokenize(line);
    if (!toks.length || toks[0].text !== 'F') return { error: '层属性行必须以 F 开头' };
    let i = 1;
    let visible = true;
    if (i < toks.length && (toks[i].text === '0' || toks[i].text === '1')) {
      visible = toks[i].text === '1';
      i++;
    }
    let color = U.DEFAULT_LAYER_COLOR;
    if (i < toks.length && U.isColorToken(toks[i].text)) {
      color = U.normColor(toks[i].text);
      i++;
    }
    const desc = restOfLine(line, toks, i);
    const f = ctx.graph.floors.get(idx);
    if (!f) return { error: '层属性行数量超出层的总数' };
    f.visible = visible;
    f.color = color;
    f.desc = desc;
    return { ok: true };
  }

  function parse(text, options) {
    options = options || {};
    const finalMode = !!options.final;
    const raw = String(text == null ? '' : text);
    const settings = { pointStart: 1, floorStart: 1 };
    if (raw.trim() === '') {
      return { ok: true, graph: GE.emptyGraph(settings), incomplete: false, warnings: [] };
    }

    const endsNL = raw.charAt(raw.length - 1) === '\n';
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const softIndex = !finalMode && !endsNL ? lines.length - 1 : -1;
    const warnings = [];

    let li = 0;
    function skipBlank() {
      while (li < lines.length && lines[li].trim() === '') li++;
    }
    function hardFail(lineIdx, message) {
      return { ok: false, error: { line: lineIdx + 1, message: message } };
    }
    function softFail() {
      return { ok: false, incomplete: true };
    }
    function fail(lineIdx, message) {
      if (lineIdx === softIndex) return softFail();
      return hardFail(lineIdx, message);
    }

    skipBlank();
    while (li < lines.length && lines[li].trim().charAt(0) === '#') {
      const toks = tokenize(lines[li].trim());
      let i = 0;
      while (i < toks.length) {
        const key = toks[i].text;
        if (key !== '#pointnumber' && key !== '#floornumber') {
          return fail(li, '未知的编号指令「' + key + '」，只支持 #pointnumber 与 #floornumber');
        }
        if (i + 1 >= toks.length) return fail(li, '编号指令缺少取值（0 或 1）');
        const val = toks[i + 1].text;
        if (val !== '0' && val !== '1') return fail(li, '编号指令的取值只能是 0 或 1');
        if (key === '#pointnumber') settings.pointStart = Number(val);
        else settings.floorStart = Number(val);
        i += 2;
      }
      li++;
      skipBlank();
    }

    if (li >= lines.length) {
      if (finalMode) return hardFail(lines.length - 1, '缺少数量行：点数量 边数量 [层数量]');
      return softFail();
    }

    const countToks = tokenize(lines[li]);
    if (countToks.length < 2 || countToks.length > 3) {
      return fail(li, '首行需要 2 或 3 个整数：点数量 边数量 [层数量]');
    }
    for (let i = 0; i < countToks.length; i++) {
      if (!U.isIntToken(countToks[i].text)) return fail(li, '首行只能包含整数');
    }
    const pointCount = U.int(countToks[0].text);
    const edgeCount = U.int(countToks[1].text);
    const floorCount = countToks.length === 3 ? U.int(countToks[2].text) : 1;
    if (pointCount < 0 || edgeCount < 0 || floorCount < 0) return fail(li, '数量不能为负数');
    if (pointCount > GE.LIMITS.points) return hardFail(li, '点的数量超过上限 ' + GE.LIMITS.points);
    if (edgeCount > GE.LIMITS.edges) return hardFail(li, '边的数量超过上限 ' + GE.LIMITS.edges);
    if (floorCount > GE.LIMITS.floors) return hardFail(li, '层的数量超过上限 ' + GE.LIMITS.floors);
    if (floorCount < 1) return hardFail(li, '层的数量至少为 1');
    if (pointCount === 0 && edgeCount > 0) return hardFail(li, '没有点时不能有边');

    const g = new GE.Graph(settings);
    for (let i = 0; i < floorCount; i++) g.insertFloor({ id: i, visible: true, desc: '' });
    for (let i = 0; i < pointCount; i++) {
      g.insertPoint({
        id: i,
        floor: floorCount === 1 ? 0 : -1,
        weight: null,
        color: '#000000',
        desc: '',
        x: undefined,
        y: undefined,
      });
    }

    const ctx = {
      graph: g,
      pointCount: pointCount,
      floorCount: floorCount,
      pointStart: settings.pointStart,
      floorStart: settings.floorStart,
      singleFloor: floorCount === 1,
    };

    li++;
    let incomplete = false;

    /* -------- edge lines -------- */
    let readEdges = 0;
    while (readEdges < edgeCount) {
      skipBlank();
      if (li >= lines.length) {
        if (finalMode) {
          return hardFail(Math.max(0, lines.length - 1), '边行数量不足：首行声明了 ' + edgeCount + ' 条边，但只找到 ' + readEdges + ' 条');
        }
        incomplete = true;
        break;
      }
      const first = firstToken(lines[li]);
      if (first === 'P' || first === 'F') {
        if (li === softIndex && !finalMode) {
          incomplete = true;
          break;
        }
        return hardFail(li, '边行数量不足：首行声明了 ' + edgeCount + ' 条边，但只找到 ' + readEdges + ' 条');
      }
      const res = parseEdgeLine(lines[li], li, ctx);
      if (res.missing || res.error) {
        if (li === softIndex) {
          incomplete = true;
          break;
        }
        return hardFail(li, res.missing ? res.message : res.error);
      }
      li++;
      readEdges++;
    }

    /* -------- point lines -------- */
    skipBlank();
    let readPoints = 0;
    const hasPointRows = li < lines.length && firstToken(lines[li]) === 'P';
    if (hasPointRows) {
      while (readPoints < pointCount) {
        skipBlank();
        if (li >= lines.length) {
          if (finalMode) {
            return hardFail(Math.max(0, lines.length - 1), '点属性行数量不足：应为 ' + pointCount + ' 行，实际 ' + readPoints + ' 行');
          }
          incomplete = true;
          break;
        }
        if (firstToken(lines[li]) !== 'P') break;
        const res = parsePointLine(lines[li], li, ctx, readPoints);
        if (res.missing || res.error) {
          if (li === softIndex) {
            incomplete = true;
            break;
          }
          return hardFail(li, res.missing ? res.message : res.error);
        }
        li++;
        readPoints++;
      }
      if (readPoints > 0 && readPoints < pointCount && !incomplete) {
        if (finalMode) {
          return hardFail(li, '点属性行数量不足：应为 ' + pointCount + ' 行，实际 ' + readPoints + ' 行');
        }
        incomplete = true;
      }
    }

    /* -------- floor lines -------- */
    skipBlank();
    let readFloors = 0;
    const hasFloorRows = li < lines.length && firstToken(lines[li]) === 'F';
    if (hasFloorRows) {
      while (readFloors < floorCount) {
        skipBlank();
        if (li >= lines.length) {
          if (finalMode) {
            return hardFail(Math.max(0, lines.length - 1), '层属性行数量不足：应为 ' + floorCount + ' 行，实际 ' + readFloors + ' 行');
          }
          incomplete = true;
          break;
        }
        if (firstToken(lines[li]) !== 'F') break;
        const res = parseFloorLine(lines[li], li, ctx, readFloors);
        if (res.error) {
          if (li === softIndex) {
            incomplete = true;
            break;
          }
          return hardFail(li, res.error);
        }
        li++;
        readFloors++;
      }
      if (readFloors > 0 && readFloors < floorCount && !incomplete) {
        if (finalMode) {
          return hardFail(li, '层属性行数量不足：应为 ' + floorCount + ' 行，实际 ' + readFloors + ' 行');
        }
        incomplete = true;
      }
    }

    /* -------- leftovers -------- */
    skipBlank();
    if (li < lines.length) {
      const first = firstToken(lines[li]);
      if (first === 'P') {
        return hardFail(li, '点属性行多于点的总数（' + pointCount + '）');
      }
      if (first === 'F') {
        return hardFail(li, '层属性行多于层的总数（' + floorCount + '）');
      }
      if (li === softIndex) {
        incomplete = true;
      } else {
        return hardFail(li, '无法识别的多余行');
      }
    }

    if (finalMode && incomplete) {
      return hardFail(lines.length - 1, '文档不完整，请补齐所有行');
    }

    /* -------- defaults & matching -------- */
    if (floorCount > 1) {
      let unassigned = 0;
      for (let i = 0; i < pointCount; i++) {
        const p = g.points.get(i);
        if (p && p.floor === -1) {
          p.floor = 0;
          unassigned++;
        }
      }
      if (unassigned > 0) {
        warnings.push(unassigned + ' 个节点未声明层级，已放入第 ' + g.floorDisp(0) + ' 层');
      }
    }

    const old = options.existing;
    if (old && old.getIndex) {
      const oldIndex = old.getIndex();
      const posMap = new Map();
      for (let i = 0; i < oldIndex.points.length; i++) {
        const op = oldIndex.points[i];
        if (op.x == null || op.y == null) continue;
        const fd = oldIndex.floorDisp.get(op.floor);
        const pd = oldIndex.pointDisp.get(op.id);
        if (fd == null || pd == null) continue;
        posMap.set(fd + '|' + pd, { x: op.x, y: op.y });
      }
      for (let i = 0; i < g.getIndex().points.length; i++) {
        const p = g.getIndex().points[i];
        const key = g.floorDisp(p.floor) + '|' + g.pointDisp(p.id);
        const pos = posMap.get(key);
        if (pos) {
          p.x = pos.x;
          p.y = pos.y;
        }
      }
    }

    g.bump();
    return { ok: true, graph: g, incomplete: incomplete, warnings: warnings };
  }

  function serialize(graph, options) {
    options = options || {};
    const lines = [];
    const ps = graph.settings.pointStart;
    const fs = graph.settings.floorStart;
    if (ps !== 1 || fs !== 1) {
      const parts = [];
      if (ps !== 1) parts.push('#pointnumber ' + ps);
      if (fs !== 1) parts.push('#floornumber ' + fs);
      lines.push(parts.join(' '));
    }
    const idx = graph.getIndex();
    const N = idx.points.length;
    const M = idx.edges.length;
    const F = idx.floors.length;
    lines.push(F > 1 ? N + ' ' + M + ' ' + F : N + ' ' + M);

    for (let i = 0; i < idx.edges.length; i++) {
      const e = idx.edges[i];
      const pa = graph.points.get(e.a);
      const pb = graph.points.get(e.b);
      if (!pa || !pb) continue;
      const parts = [String(graph.pointDisp(e.a)), String(graph.pointDisp(e.b))];
      if (F > 1) parts.push(String(graph.floorDisp(pa.floor)), String(graph.floorDisp(pb.floor)));
      parts.push(e.directed ? '1' : '0');
      if (e.weight != null) parts.push(U.weightText(e.weight));
      if (e.color && e.color !== '#000000') parts.push(e.color);
      if (e.desc) parts.push(e.desc);
      lines.push(parts.join(' '));
    }

    for (let i = 0; i < idx.points.length; i++) {
      const p = idx.points[i];
      const parts = ['P'];
      if (p.weight != null) parts.push(U.weightText(p.weight));
      if (F > 1) parts.push(String(graph.floorDisp(p.floor)));
      if (p.color && p.color !== '#000000') parts.push(p.color);
      if (p.desc) parts.push(p.desc);
      lines.push(parts.join(' '));
    }

    let needFloors = false;
    for (let i = 0; i < idx.floors.length; i++) {
      const f = idx.floors[i];
      if (!f.visible || f.desc || (f.color && f.color !== U.DEFAULT_LAYER_COLOR)) {
        needFloors = true;
        break;
      }
    }
    if (needFloors) {
      for (let i = 0; i < idx.floors.length; i++) {
        const f = idx.floors[i];
        const parts = ['F', f.visible ? '1' : '0'];
        if (f.color && f.color !== U.DEFAULT_LAYER_COLOR) parts.push(f.color);
        if (f.desc) parts.push(f.desc);
        lines.push(parts.join(' '));
      }
    }

    return lines.join('\n') + '\n';
  }

  GE.Parser = {
    parse: parse,
    serialize: serialize,
    tokenize: tokenize,
  };
})(globalThis.GE = globalThis.GE || {});
