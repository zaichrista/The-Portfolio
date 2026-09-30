// Portfolio server: serves the site, the SVG pages and a small JSON API.
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'site.json');
const CV_FILE = path.join(PUBLIC_DIR, 'assets', 'cv', 'cv.pdf');

// Read on every request so edits to data/site.json show up without a restart.
function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

app.use(express.static(PUBLIC_DIR, { index: false }));

// ---- API ----------------------------------------------------------------
app.get('/api/site', (req, res) => {
  res.json(loadData());
});

app.get('/api/projects/:slug', (req, res) => {
  const project = loadData().projects.find((p) => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// ---- CV -----------------------------------------------------------------
// Drop your CV at public/assets/cv/cv.pdf and this link starts working.
app.get('/cv', (req, res) => {
  if (fs.existsSync(CV_FILE)) return res.sendFile(CV_FILE);
  res.status(404).send('CV coming soon.');
});

// ---- Pages --------------------------------------------------------------
// Every page is rendered by the same shell; public/js/app.js picks the SVG.
const shell = (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html'));

app.get(['/', '/about', '/work'], shell);

app.get('/work/:slug', (req, res) => {
  const exists = loadData().projects.some((p) => p.slug === req.params.slug);
  if (!exists) return res.redirect('/work');
  shell(req, res);
});

app.use((req, res) => res.redirect('/'));

app.listen(PORT, () => {
  console.log(`Portfolio running at http://localhost:${PORT}`);
});
