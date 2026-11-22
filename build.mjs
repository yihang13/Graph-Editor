#!/usr/bin/env node
/**
 * Bundles src/ into a single standalone HTML file with no external requests.
 * Usage: node build.mjs [--out dist/graph-editor.html]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, 'src');
const outArgIdx = process.argv.indexOf('--out');
const outFile = path.resolve(root, outArgIdx >= 0 && process.argv[outArgIdx + 1] ? process.argv[outArgIdx + 1] : 'dist/graph-editor.html');

let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

// Inline the stylesheet.
html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/i, (_m, href) => {
  const css = fs.readFileSync(path.join(srcDir, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// Inline every script in document order.
const scriptRe = /<script\s+src="([^"]+)"\s*><\/script>/gi;
const seen = [];
html = html.replace(scriptRe, (_m, src) => {
  const code = fs.readFileSync(path.join(srcDir, src), 'utf8');
  seen.push(src);
  return `<script>\n/* ===== ${src} ===== */\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;
});

// Guards: the artifact must be fully self-contained. <a href> links (author /
// GitHub) are intentional navigation, not resource requests, so only check
// resource-bearing tags.
const externalRefs = html.match(/<(?:script|link|img)[^>]+(?:src|href)="(?!data:|#)([^"]+)"/gi) || [];
const leftoverScripts = html.match(/<script\s+src=/gi) || [];
if (leftoverScripts.length) throw new Error('Bundling left external <script src> tags behind');
if (externalRefs.length) console.warn('Warning: possible external references remain:', externalRefs);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built ${path.relative(root, outFile)} (${kb} KiB)`);
console.log(`inlined ${seen.length} scripts + styles.css`);
