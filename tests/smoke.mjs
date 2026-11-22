/* Minimal Node smoke test: loads the browser-agnostic modules into a VM context. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const files = ['util.js', 'model.js', 'parser.js'];
const context = vm.createContext({ console, setTimeout, clearTimeout, performance });
const code = files.map((f) => fs.readFileSync(path.join('src/js', f), 'utf8')).join('\n;\n');
vm.runInContext(code, context);
const GE = context.GE;

let pass = 0;
let fail = 0;
function ok(cond, msg, extra) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log('FAIL:', msg, extra === undefined ? '' : extra);
  }
}
function eq(a, b, msg) {
  ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b });
}

/* ---------- parser basics ---------- */
const t1 = `3 2
1 2 0
2 3 1 2.5
P 1
P #ff0000 hi
P 2 0 3.5 desc here
`;
const r1 = GE.Parser.parse(t1, { final: true });
ok(r1.ok, 'basic parse ok', r1.error);
if (r1.ok) {
  const g = r1.graph;
  eq(g.stats(), { points: 3, edges: 2, floors: 1 }, 'basic counts');
  eq(g.pointDisp(0), 1, 'point display 1-based');
  eq(g.edgeList ? 0 : g.edges.size, 2, 'edges size');
  const e2 = g.edges.get(1);
  eq(e2.directed, true, 'edge directed');
  eq(e2.weight, 2.5, 'edge weight');
  const p0 = g.points.get(0);
  eq(p0.weight, 1, 'point 0 weight');
  const p1 = g.points.get(1);
  eq(p1.color, '#ff0000', 'point 1 color');
  eq(p1.desc, 'hi', 'point 1 desc');
  const p2 = g.points.get(2);
  eq(p2.weight, 2, 'point2 weight (integer, single floor)');
  eq(p2.color, '#000000', 'point2 default color');
  eq(p2.desc, '0 3.5 desc here', 'point2 desc takes rest');
  const text2 = GE.Parser.serialize(g);
  const r1b = GE.Parser.parse(text2, { final: true });
  ok(r1b.ok, 'serialize round trip 1', r1b.error);
  if (r1b.ok) eq(GE.Parser.serialize(r1b.graph), text2, 'serialize stable 1');
}

const t2 = `4 2 2
1 2 1 2 0
3 4 1 2 1 5
P 1
P 2 2
P 1
P 1 2 #00f desc two
F 1 first
F 0 second
`;
const r2 = GE.Parser.parse(t2, { final: true });
ok(r2.ok, 'multi floor parse ok', r2.error);
if (r2.ok) {
  const g = r2.graph;
  eq(g.stats(), { points: 4, edges: 2, floors: 2 }, 'multi counts');
  eq(g.points.get(0).floor, 0, 'p0 floor 1');
  eq(g.points.get(1).floor, 1, 'p1 floor 2');
  eq(g.points.get(2).floor, 0, 'p2 floor 1');
  eq(g.points.get(3).floor, 1, 'p3 floor 2');
  const e1 = g.edges.get(1);
  eq(g.points.get(e1.a).floor !== g.points.get(e1.b).floor, true, 'cross floor edge');
  eq(g.floors.get(0).desc, 'first', 'floor desc');
  eq(g.floors.get(1).visible, false, 'floor hidden');
  eq(g.floors.get(0).color, '#2563eb', 'default layer color');
  const text = GE.Parser.serialize(g);
  const r2b = GE.Parser.parse(text, { final: true });
  ok(r2b.ok, 'serialize round trip 2', r2b.error);
  if (r2b.ok) eq(GE.Parser.serialize(r2b.graph), text, 'serialize stable 2');
}

const t3 = `#pointnumber 0 #floornumber 0
3 2
0 1 0
1 2 1 1
P 5
P
P 3
F 0 隐藏层
`;
const r3 = GE.Parser.parse(t3, { final: true });
ok(r3.ok, '0-based parse ok', r3.error);
if (r3.ok) {
  eq(r3.graph.settings, { pointStart: 0, floorStart: 0 }, '0-based settings');
  eq(r3.graph.pointDisp(0), 0, 'display 0');
  const text = GE.Parser.serialize(r3.graph);
  ok(text.startsWith('#pointnumber 0 #floornumber 0'), 'serialize keeps directives');
  const r3b = GE.Parser.parse(text, { final: true });
  ok(r3b.ok, '0-based round trip', r3b.error);
}

/* ---------- optional point rows / multi-dim / self loop ---------- */
const t4 = `3 2 2
1 2 1 1 0
2 3 1 1 1
F
F
`;
const r4 = GE.Parser.parse(t4, { final: true });
ok(r4.ok, 'omitted point rows parse', r4.error);
if (r4.ok) {
  eq(r4.graph.stats(), { points: 3, edges: 2, floors: 2 }, 'omitted point rows stats');
  eq(r4.graph.points.get(0).floor, 0, 'implicit floor from edges');
  eq(r4.graph.points.get(0).weight, null, 'implicit default weight');
  eq(r4.graph.points.get(0).color, '#000000', 'implicit default color');
}

const t5 = `1 1
1 1 0
P (1,-2.5,3) #abc 描述 可以有 空格
`;
const r5 = GE.Parser.parse(t5, { final: true });
ok(r5.ok, 'self loop + tuple weight parse', r5.error);
if (r5.ok) {
  const p = r5.graph.points.get(0);
  eq(p.weight, [1, -2.5, 3], 'multi dimensional weight');
  eq(p.color, '#aabbcc', 'short hex expanded');
  eq(p.desc, '描述 可以有 空格', 'desc with spaces');
  const e = r5.graph.edges.get(0);
  eq(e.a, e.b, 'self loop endpoints');
  const back = GE.Parser.serialize(r5.graph);
  const r5b = GE.Parser.parse(back, { final: true });
  ok(r5b.ok, 'self loop round trip', r5b.error);
  if (r5b.ok) eq(r5b.graph.points.get(0).weight, [1, -2.5, 3], 'tuple weight round trip');
}

const t6 = `2 1
1 2 0
P
P
P
`;
const r6 = GE.Parser.parse(t6, { final: true });
ok(!r6.ok && r6.error.message.includes('多于'), 'extra point rows rejected', r6);

const t7 = `2 1 0
1 2 0
P
P
`;
const r7 = GE.Parser.parse(t7, { final: true });
ok(!r7.ok && r7.error.message.includes('至少'), 'zero floors rejected', r7);

/* ---------- layer colors ---------- */
const t8 = `2 1 2
1 2 1 2 0
P 1
P 2
F 1 #b45309 第一层
F 1 第二层
`;
const r8 = GE.Parser.parse(t8, { final: true });
ok(r8.ok, 'layer color parse', r8.error);
if (r8.ok) {
  eq(r8.graph.floors.get(0).color, '#b45309', 'explicit layer color');
  eq(r8.graph.floors.get(1).color, '#2563eb', 'default layer color in document');
  const txt = GE.Parser.serialize(r8.graph);
  ok(txt.includes('F 1 #b45309 第一层'), 'layer color serialized', txt);
  const r8b = GE.Parser.parse(txt, { final: true });
  ok(r8b.ok, 'layer color round trip', r8b.error);
  if (r8b.ok) eq(r8b.graph.floors.get(0).color, '#b45309', 'layer color round trip value');
}

/* ---------- errors ---------- */
function bad(text, fragment, msg) {
  const r = GE.Parser.parse(text, { final: true });
  ok(!r.ok, msg + ' should fail', r);
  if (!r.ok && r.error) ok(r.error.message.includes(fragment), msg + ' message', r.error);
}
bad('2 1\n1 9 0\nP\nP\n', '超出范围', 'edge endpoint range');
bad('2 1 2\n1 2 1 3 0\nP 1\nP 2\n', '超出范围', 'edge floor range');
bad('2 1 2\n1 2 1 1 2\nP 1\nP 3\n', '方向标记', 'bad direction');
bad('2 1\n1 2 0\nP (1,x)\nP 2\n', '点权格式错误', 'bad point weight tuple');
bad('2 1\n1 2 0\nP 1\n', '数量不足', 'missing point rows');

/* ---------- tolerant typing ---------- */
const partial = '3 2\n1 2 0\n';
const rp = GE.Parser.parse(partial, { final: false });
ok(rp.ok && rp.incomplete, 'partial tolerant ok+incomplete', rp);
if (rp.ok) eq(rp.graph.edges.size, 1, 'partial graph has 1 edge');
const rp2 = GE.Parser.parse('3', { final: false });
ok(!rp2.ok && rp2.incomplete, 'partial counts no graph', rp2);

/* ---------- model / history ---------- */
const g4 = GE.emptyGraph({ pointStart: 1, floorStart: 1 });
const h4 = new GE.History(10);
let m = new GE.Mutator(g4, '新建节点');
const pA = m.addPoint({ x: 0, y: 0 });
const pB = m.addPoint({ x: 10, y: 10 });
const eAB = m.addEdge({ a: pA.id, b: pB.id, directed: false });
h4.push(m.toCommand());
eq(g4.stats(), { points: 2, edges: 1, floors: 1 }, 'model add counts');
eq(g4.adj.get(pA.id).size, 1, 'adjacency');
const up = h4.undo(g4);
eq(up.graph.stats(), { points: 0, edges: 0, floors: 1 }, 'undo add');
const re = h4.redo(up.graph);
eq(re.graph.stats(), { points: 2, edges: 1, floors: 1 }, 'redo add');

m = new GE.Mutator(g4, '删除节点');
m.removePoint(pA.id);
h4.push(m.toCommand());
eq(g4.stats(), { points: 1, edges: 0, floors: 1 }, 'delete point cascade');
const up2 = h4.undo(g4);
eq(up2.graph.stats(), { points: 2, edges: 1, floors: 1 }, 'undo delete restores edge');
eq(up2.graph.pointDisp(pA.id), 1, 'undo restore display');

/* numbering: a command, undoable */
m = new GE.Mutator(g4, '切换到 0 起点');
m.setSettings({ pointStart: 0 });
h4.push(m.toCommand());
eq(g4.pointDisp(pA.id), 0, 'switch to 0-based display');
eq(g4.settings.pointStart, 0, 'settings pointStart');
const up3 = h4.undo(g4);
eq(up3.graph.settings.pointStart, 1, 'undo numbering switch');

/* floor display compaction */
const g5 = new GE.emptyGraph({ pointStart: 1, floorStart: 1 });
const h5 = new GE.History(10);
m = new GE.Mutator(g5, 'add floors');
const f0 = g5.firstFloorId();
const f1 = m.addFloor({}).id;
const f2 = m.addFloor({}).id;
h5.push(m.toCommand());
eq([g5.floorDisp(f0), g5.floorDisp(f1), g5.floorDisp(f2)], [1, 2, 3], 'floor display');
m = new GE.Mutator(g5, 'del floor');
m.removeFloor(f1);
h5.push(m.toCommand());
eq([g5.floorDisp(f0), g5.floorDisp(f2)], [1, 2], 'floor display after delete');
const u5 = h5.undo(g5);
eq([u5.graph.floorDisp(f0), u5.graph.floorDisp(f1), u5.graph.floorDisp(f2)], [1, 2, 3], 'undo floor delete');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
