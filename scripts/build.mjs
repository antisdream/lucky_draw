import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, 'src', name), 'utf8');
const [template, css, core, app] = await Promise.all(['shell.html', 'style.css', 'core.js', 'app.js'].map(read));
const script = `(() => {\n'use strict';\n${core.replace(/^export /gm, '')}\n${app}\n})();`;
new vm.Script(script, { filename: 'lucky-draw.js' });
if (/<\/script/i.test(script) || /<\/style/i.test(css)) throw new Error('Unsafe embedded closing tag');
const output = template.replace('/* INLINE_CSS */', () => css).replace('/* INLINE_JS */', () => script);
if (/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(output)) throw new Error('External runtime asset found');
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'index.html'), output, 'utf8');
await writeFile(path.join(root, 'dist', 'index.html'), output, 'utf8');
console.log(`Built index.html (${Buffer.byteLength(output).toLocaleString()} bytes), no external assets.`);
