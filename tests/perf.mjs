/* Layout / parser performance sanity check (no DOM required). */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const context = vm.createContext({ console, setTimeout, clearTimeout, performance });
const code = ['util.js', 'model.js', 'parser.js', 'layout.js']
  .map((f) => fs.readFileSync(path.join(project, 'src/js', f), 'utf8'))
  .join('\n;\n');
vm.runInContext(code, context);
const GE = context.GE;

function makeGraph(n, m, floors) {
  const g = new GE.Graph({ pointStart: 1, floorStart: 1 });
  for (let i = 0; i < floors; i++) g.insertFloor({ id: i, visible: true, desc: '' });
  for (let i = 0; i < n; i++) {
    g.insertPoint({
      id: i,
      floor: i % floors,
      weight: i % 5 === 0 ? i : null,
      color: '#1d4ed8',
      desc: i % 7 === 0 ? 'node-' + i : '',
      x: undefined,
      y: undefined,
    });
  }
  for (let i = 0; i < m; i++) {
    const a = i % n;
    const b = (i * 37 + 11) % n;
    g.insertEdge({ id: i, a: a, b: b, directed: i % 3 === 0, weight: i % 9, color: '#334155', desc: '' });
  }
  return g;
}

function time(fn) {
  const t0 = performance.now();
  const r = fn();
  return { ms: Math.round(performance.now() - t0), value: r };
}

function run(n, m, floors, steps) {
  const g = makeGraph(n, m, floors);
  GE.Layout.seed(g);
  const sim = new GE.Layout.Sim(g);
  sim.reheat(1);
  const res = time(() => {
    for (let i = 0; i < steps; i++) sim.step();
  });
  let bad = 0;
  for (const p of g.points.values()) {
    if (!isFinite(p.x) || !isFinite(p.y)) bad++;
  }
  const b = GE.Layout.bounds(Array.from(g.points.values()));
  console.log(
    `${n} nodes / ${m} edges / ${floors} floors: ${steps} steps in ${res.ms}ms (${(res.ms / steps).toFixed(2)}ms/step), bad=${bad}, bounds=${Math.round(b.maxX - b.minX)}x${Math.round(b.maxY - b.minY)}`
  );
  return { ms: res.ms, bad };
}

run(50, 120, 1, 300);
run(100, 300, 1, 300);
run(100, 300, 3, 300);
run(1000, 3000, 1, 60);
run(1000, 3000, 10, 30);
run(10000, 20000, 1, 5);

/* TXT parse/serialize performance */
const lines = ['#pointnumber 1 #floornumber 1', ''];
const N = 5000;
const M = 20000;
lines[1] = `${N} ${M} 1`;
for (let i = 0; i < M; i++) {
  lines.push(`${(i % N) + 1} ${((i * 7 + 3) % N) + 1} ${i % 2} ${(i % 5) + 1} #334155 desc-${i}`);
}
for (let i = 0; i < N; i++) lines.push(`P ${i % 9} #1d4ed8${i % 11 === 0 ? ' desc-' + i : ''}`);
const doc = lines.join('\n');
const parsed = time(() => GE.Parser.parse(doc, { final: true }));
console.log(`TXT parse ${N} nodes / ${M} edges: ${parsed.ms}ms ok=${parsed.value.ok}`);
const ser = time(() => GE.Parser.serialize(parsed.value.graph));
console.log(`TXT serialize: ${ser.ms}ms, ${(ser.value.length / 1024 / 1024).toFixed(1)} MiB`);
const round = time(() => GE.Parser.parse(ser.value, { final: true }));
console.log(`TXT reparse: ${round.ms}ms ok=${round.value.ok}`);

if (parsed.value.ok && round.value.ok) {
  const a = parsed.value.graph.stats();
  const b = round.value.graph.stats();
  if (a.points !== b.points || a.edges !== b.edges) {
    console.log('ROUND TRIP STATS MISMATCH', a, b);
    process.exit(1);
  }
}
console.log('perf test done');
