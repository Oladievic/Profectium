// Copyright (c) 2026 Криницин Вячеслав Александрович — Oladievic.
import { cp, readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(root, '../design');
const destination = path.join(root, 'dist/client');
const resources = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': '/vendor/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': '/vendor/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js': '/vendor/babel.min.js',
};
export async function prepareRedesign() {
  await stat(path.join(root, 'dist/server/index.js'));
  await mkdir(destination, { recursive: true });
  const files = await readdir(source, { withFileTypes: true });
  for (const entry of files) {
    if (entry.isDirectory()) {
      if (['assets', 'vendor'].includes(entry.name)) await cp(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true });
      continue;
    }
    if (!/\.(html|js|css)$/.test(entry.name)) continue;
    let data = await readFile(path.join(source, entry.name));
    if (entry.name.endsWith('.html')) {
      let html = data.toString('utf8');
      html = html.replace(/<head>/i, '<head><meta name="profectium-ui" content="redesign"><script>window.__resources=' + JSON.stringify(resources) + ';</script>');
      if (!html.includes('src="./backend.js"') && !html.includes('src="backend.js"')) html = html.replace('<script src="./support.js">', '<script src="./backend.js"></script><script src="./support.js">');
      html = html.replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s<>]+/g, '/vendor/fonts-4c5d80bb8671.css');
      html = html.replace(/<link\b[^>]*rel=["']preconnect["'][^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/gi, '');
      data = Buffer.from(html);
    }
    await writeFile(path.join(destination, entry.name), data);
  }
  await writeFile(path.join(destination, '_headers'), '/*.dc.html\n  Cache-Control: no-cache\n/backend*.js\n  Cache-Control: no-cache\n');
  console.log('Prepared all eight redesign pages with local fonts, assets and live API adapters.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareRedesign();
