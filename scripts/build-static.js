// Packs the whole site into one self-contained HTML file (dist/index.html):
// SVG pages, project data, images and code all inlined. Used for sharing a
// preview link or hosting somewhere without a Node server.
//
//   npm run build:static
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');

const read = (p) => fs.readFileSync(path.join(PUBLIC, p), 'utf8');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };

// "/assets/…" → data: URI, so the file needs nothing else next to it.
function inlineAsset(url) {
  const file = path.join(PUBLIC, url);
  if (!url.startsWith('/assets/') || !fs.existsSync(file)) return url;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}
const inlineAssetsIn = (text) => text.replace(/\/assets\/[^"')\s]+/g, inlineAsset);

// Project data, with any image paths inlined.
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
for (const p of data.projects) {
  if (p.preview) p.preview = inlineAsset(p.preview);
  for (const m of p.media || []) if (m.src) m.src = inlineAsset(m.src);
}

// Every SVG page, keyed by the URL app.js asks for.
const svgs = {};
for (const name of ['home', 'about', 'work']) svgs[`/svg/${name}.svg`] = inlineAssetsIn(read(`svg/${name}.svg`));
for (const f of fs.readdirSync(path.join(PUBLIC, 'svg', 'projects'))) {
  if (f.endsWith('.svg')) svgs[`/svg/projects/${f}`] = read(`svg/projects/${f}`);
}

// The CV travels next to the page as its own file (dist/cv.pdf).
const CV_SRC = path.join(PUBLIC, 'assets', 'cv', 'cv.pdf');
const hasCv = fs.existsSync(CV_SRC);

const payload = JSON.stringify({ data, svgs, cv: hasCv ? 'cv.pdf' : null }).replace(/<\//g, '<\\/');

// Reuse index.html, swapping the external CSS/JS for inline copies.
let html = read('index.html')
  .replace('<link rel="stylesheet" href="/css/style.css">', () => `<style>\n${read('css/style.css')}\n</style>`)
  .replace('<script src="/js/app.js"></script>',
    () => `<script>window.PORTFOLIO_STATIC = ${payload};</script>\n<script>\n${read('js/app.js')}\n</script>`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'index.html');
fs.writeFileSync(out, html);
if (hasCv) fs.copyFileSync(CV_SRC, path.join(OUT_DIR, 'cv.pdf'));
console.log(`Built ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
