/* ==========================================================================
   Zaira Christa: portfolio

   Each page's SVG design is cut into "blocks" (the title, each menu word,
   each project, each discipline…) and rebuilt as ordinary, accessible HTML:
   headings, links, buttons, lists, real paragraphs. The artwork inside each
   block is the original outlined lettering, untouched.

   style.css then lays the same blocks out two ways:
   - Canvas (large, landscape screens): every block sits at its exact spot
     in the design, stretched with the window. No scrolling.
   - Flow (phones, portrait tablets, zoomed-in browsers): blocks stack into
     a readable column, each scaled in proportion so nothing is squashed.
   ========================================================================== */
(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const stage = document.getElementById('stage');
  const svgCache = new Map();
  let siteData = null;
  let renderToken = 0;
  let pageAbort = null;
  const pageSignal = () => pageAbort.signal;

  // Set by scripts/build-static.js: the whole site packed into one file,
  // with no server, so pages are switched in memory instead of by URL.
  const STATIC = window.PORTFOLIO_STATIC || null;
  let staticPath = '/';
  const currentPath = () => (STATIC ? staticPath : location.pathname);

  // ---- Routes -------------------------------------------------------------
  function matchRoute(pathname) {
    const clean = pathname.replace(/\/+$/, '') || '/';
    if (clean === '/') return { page: 'home', svg: '/svg/home.svg', title: 'Zaira Christa' };
    if (clean === '/about') return { page: 'about', svg: '/svg/about.svg', title: 'About · Zaira Christa' };
    if (clean === '/work') return { page: 'work', svg: '/svg/work.svg', title: 'Work · Zaira Christa' };
    const m = clean.match(/^\/work\/([a-z0-9-]+)$/);
    if (m) return { page: 'project', slug: m[1], svg: `/svg/projects/${m[1]}.svg` };
    return null;
  }

  // ---- Data ---------------------------------------------------------------
  async function getSiteData() {
    if (!siteData && STATIC) siteData = STATIC.data;
    if (!siteData) {
      const res = await fetch('/api/site');
      siteData = await res.json();
    }
    return siteData;
  }

  async function getSvgText(url) {
    if (STATIC) {
      return url in STATIC.svgs ? STATIC.svgs[url] : Promise.reject(new Error(`Missing ${url}`));
    }
    if (!svgCache.has(url)) {
      svgCache.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${url}`);
        return r.text();
      }));
    }
    return svgCache.get(url);
  }

  // ---- Small DOM helper -----------------------------------------------------
  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  }

  const srText = (text) => h('span', { class: 'sr-only', text });

  // ---- Artwork: load a design and cut it into blocks -----------------------
  // The SVG is drawn off-screen at full size so every piece can be measured.
  async function loadArtwork(url) {
    const text = await getSvgText(url);
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    svg.removeAttribute('id');
    const vb = svg.viewBox.baseVal;
    svg.setAttribute('width', vb.width);
    svg.setAttribute('height', vb.height);
    const measure = h('div', { class: 'measure', 'aria-hidden': 'true' }, [svg]);
    document.body.appendChild(measure);
    return {
      svg,
      vb: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
      byId: (id) => svg.querySelector(`[id="${id}"]`),
      dispose: () => measure.remove(),
    };
  }

  function unionBox(boxes) {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const r = Math.max(...boxes.map((b) => b.x + b.w));
    const b = Math.max(...boxes.map((bx) => bx.y + bx.h));
    return { x, y, w: r - x, h: b - y };
  }

  // Measures where a piece is actually drawn in the design, including any
  // transform on the element itself (Illustrator positions text this way).
  function drawnBox(n) {
    const b = n.getBBox();
    const own = n.transform && n.transform.baseVal.consolidate();
    if (!own) return { x: b.x, y: b.y, w: b.width, h: b.height };
    const m = own.matrix;
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function measureNodes(nodes, pad = 0) {
    const u = unionBox(nodes.map(drawnBox));
    return { x: u.x - pad, y: u.y - pad, w: u.w + pad * 2, h: u.h + pad * 2 };
  }

  // Where a block sits in the design (used by the canvas layout) and its
  // proportions (used by the flow layout).
  function placeAt(el, box, A) {
    el.style.setProperty('--x', box.x - A.vb.x);
    el.style.setProperty('--y', box.y - A.vb.y);
    el.style.setProperty('--w', box.w);
    el.style.setProperty('--h', box.h);
    el.box = box;
    el.vb = A.vb;
    anchorTo([el], 'center');
  }

  // On large screens nothing is stretched: each block scales evenly around
  // an anchor point, and that point moves with the window. Blocks that
  // belong together share one anchor, so they stay aligned as a unit.
  // `where` is 'center', 'left', 'right', 'left-top', 'right-top' (of the
  // blocks' combined box) or an explicit { x, y } in design units.
  function anchorTo(blocks, where) {
    blocks = blocks.filter(Boolean);
    if (!blocks.length) return;
    const u = unionBox(blocks.map((b) => b.box));
    const pt = typeof where === 'object' ? where : {
      x: where.includes('left') ? u.x : where.includes('right') ? u.x + u.w : u.x + u.w / 2,
      y: where.includes('top') ? u.y : u.y + u.h / 2,
    };
    for (const b of blocks) {
      b.style.setProperty('--ax', pt.x - b.vb.x);
      b.style.setProperty('--ay', pt.y - b.vb.y);
    }
  }

  function artFor(nodes, box) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'art');
    svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const n of nodes) svg.appendChild(n); // moves the original artwork
    return svg;
  }

  // An HTML element holding a piece of the design.
  function makeBlock(A, tag, nodes, { pad = 2, className = '', label = '', attrs = {} } = {}) {
    nodes = nodes.filter(Boolean);
    if (!nodes.length) return null;
    const box = measureNodes(nodes, pad);
    const el = h(tag, { class: `block ${className}`.trim(), ...attrs });
    placeAt(el, box, A);
    if (label) el.appendChild(srText(label));
    el.appendChild(artFor(nodes, box));
    return el;
  }

  // Anything in the design not claimed by a block is still drawn on large
  // screens, so new artwork from Illustrator never silently disappears.
  const DRAWABLE = 'path,text,line,polyline,polygon,circle,ellipse,rect,image,use';
  function leftoverBlock(A) {
    const nodes = [...A.svg.children].filter((c) => c.matches(DRAWABLE) || c.querySelector(DRAWABLE));
    if (!nodes.length) return null;
    return makeBlock(A, 'div', nodes, { pad: 0, className: 'canvas-only', attrs: { 'aria-hidden': 'true' } });
  }

  // Blocks in a list share one scale on small screens (the widest fills the
  // column), so a list of titles keeps its proportions.
  function setSharedWidth(container, blocks) {
    const widths = blocks.filter(Boolean).map((b) => b.box.w);
    if (widths.length) container.style.setProperty('--ref', Math.max(...widths));
  }

  // ---- Shared page parts --------------------------------------------------
  function mainMenu(A, active) {
    const nav = h('nav', { class: 'site-nav', 'aria-label': 'Main' });
    for (const [id, href, label, page] of [
      ['menu-home', '/', 'Home', 'home'],
      ['menu-about', '/about', 'About', 'about'],
      ['menu-work', '/work', 'Work', 'work'],
    ]) {
      const a = makeBlock(A, 'a', [A.byId(id)], {
        pad: 6,
        className: 'menu-link',
        label,
        attrs: { href, 'aria-current': page === active ? 'page' : null },
      });
      if (a) nav.appendChild(a);
    }
    setSharedWidth(nav, [...nav.children]);
    anchorTo([...nav.children], 'center');
    return h('header', { class: 'site-header' }, [nav]);
  }

  const heading = (A, node, label, className) =>
    makeBlock(A, 'h1', [node], { className: `page-title ${className}`, label, attrs: { tabindex: '-1' } });

  // ---- Hero title flash -----------------------------------------------------
  // Every 1 to 1.5 seconds one letter of the title cuts, with no transition,
  // to a calligraphic version of itself in one rainbow colour for 0.2s, then cuts back.
  // The same letter is never picked twice in a row.
  const FLASH_MS = 200;
  const FLASH_GAP = [1000, 1500];
  const RAINBOW = ['#ff2d55', '#ff9500', '#ffd60a', '#34c759', '#00c7ff', '#5856ff', '#c644fc'];

  // Draws a hidden script-letter overlay for each letter, centred on it.
  function addTitleFlash(title, letters, boxes) {
    const art = title.querySelector('svg.art');
    const chars = [...letters];
    if (!art || chars.length !== boxes.length) return;

    const originals = [...art.querySelectorAll('path')];
    const overlays = chars.map((ch, i) => {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('class', 'flash-letter');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('x', boxes[i].x + boxes[i].width / 2);
      t.setAttribute('y', boxes[i].y + boxes[i].height);
      t.setAttribute('visibility', 'hidden');
      t.textContent = ch;
      art.appendChild(t);
      return t;
    });

    title.startFlash = (signal) => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      let last = -1;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      (async () => {
        try { await document.fonts.load(`40px 'Pinyon Script'`, 'Zaira Christa'); } catch (e) {}
        while (!signal.aborted) {
          await sleep(FLASH_GAP[0] + Math.random() * (FLASH_GAP[1] - FLASH_GAP[0]) - FLASH_MS);
          if (signal.aborted) return;
          let i;
          do { i = Math.floor(Math.random() * originals.length); } while (i === last);
          last = i;
          const t = overlays[i];
          const b = boxes[i];
          t.style.fill = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
          t.setAttribute('font-size', b.height);
          t.setAttribute('visibility', 'visible');
          // Same width as the letter it replaces, then centred on it.
          t.setAttribute('font-size', b.height * (b.width / t.getBBox().width));
          const tb = t.getBBox();
          t.setAttribute('transform',
            `translate(${b.x + b.width / 2 - (tb.x + tb.width / 2)} ${b.y + b.height / 2 - (tb.y + tb.height / 2)})`);
          originals[i].setAttribute('visibility', 'hidden');
          await sleep(FLASH_MS);
          t.setAttribute('visibility', 'hidden');
          originals[i].removeAttribute('visibility');
        }
      })();
      signal.addEventListener('abort', () => {
        overlays.forEach((t) => t.setAttribute('visibility', 'hidden'));
        originals.forEach((p) => p.removeAttribute('visibility'));
      });
    };
  }

  // ---- Home ---------------------------------------------------------------
  function buildHome(A, data) {
    const copy = data.pages.home;
    const header = mainMenu(A, 'home');

    // Measured now, while the artwork is still laid out off-screen.
    const titleNode = A.byId('home-title');
    const letterBoxes = titleNode ? [...titleNode.querySelectorAll('path')].map((p) => p.getBBox()) : [];

    const title = heading(A, titleNode, copy.title, 'home-title');
    if (title) addTitleFlash(title, copy.title.replace(/\s+/g, '').toUpperCase(), letterBoxes);
    const taglineArt = makeBlock(A, 'div', [A.byId('home-tagline')], {
      className: 'home-tagline canvas-only', attrs: { 'aria-hidden': 'true' },
    });
    const tagline = h('div', { class: 'flow-text condensed-clip' }, [
      h('p', { class: 'condensed home-tagline-text' }, copy.tagline.flatMap((line, i) => (i ? [h('br'), line] : [line]))),
    ]);

    const prompt = makeBlock(A, 'p', [A.byId('home-cv-prompt')], { className: 'home-cv-prompt', label: copy.cvPrompt });
    const hasCv = !STATIC || STATIC.cv;
    const cv = makeBlock(A, hasCv ? 'a' : 'div', [A.byId('home-cv')], {
      pad: 4,
      className: 'cv-link',
      label: hasCv ? 'CV (opens in a new tab)' : '',
      attrs: hasCv
        ? { href: STATIC ? STATIC.cv : '/cv', target: '_blank', rel: 'noopener' }
        : { 'aria-hidden': 'true' },
    });

    if (title) anchorTo([title, taglineArt], { x: title.box.x + title.box.w / 2, y: title.box.y + title.box.h / 2 });
    anchorTo([prompt, cv], 'right');

    const main = h('main', { class: 'page-main', id: 'main' }, [
      h('div', { class: 'home-intro' }, [title, taglineArt, tagline]),
      h('div', { class: 'home-cv-row' }, [prompt, cv]),
      leftoverBlock(A),
    ]);
    return [header, main];
  }

  // ---- About --------------------------------------------------------------
  function buildAbout(A, data) {
    const copy = data.pages.about;
    const header = mainMenu(A, 'about');
    const page = A.byId('About_page') || A.svg;

    // The photo becomes a real <img>, so it is never stretched.
    const image = page.querySelector('image');
    let photo = null;
    if (image) {
      const holder = image.parentNode;
      const box = measureNodes([holder]);
      photo = h('figure', { class: 'block about-photo' }, [
        h('img', {
          src: image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href'),
          alt: copy.photoAlt,
          width: image.getAttribute('width'),
          height: image.getAttribute('height'),
          decoding: 'async',
        }),
      ]);
      placeAt(photo, box, A);
      holder.remove();
    }

    // The lettering: title on the right half, body text on the left.
    const mid = A.vb.x + A.vb.w / 2;
    const paths = [...page.querySelectorAll('path')];
    const isRight = (p) => { const b = p.getBBox(); return b.x + b.width / 2 > mid; };
    const titlePaths = paths.filter(isRight);
    const bodyPaths = paths.filter((p) => !titlePaths.includes(p));

    const title = makeBlock(A, 'h1', titlePaths, {
      className: 'page-title about-title', label: copy.title, attrs: { tabindex: '-1' },
    });
    const bodyArt = makeBlock(A, 'div', bodyPaths, { className: 'about-body canvas-only', attrs: { 'aria-hidden': 'true' } });
    const body = h('div', { class: 'flow-text condensed-clip' }, [
      h('div', { class: 'condensed about-text' }, copy.paragraphs.map((p) => h('p', { text: p }))),
    ]);

    anchorTo([title, photo], 'right-top');
    anchorTo([bodyArt], 'left');

    const main = h('main', { class: 'page-main', id: 'main' }, [title, photo, bodyArt, body, leftoverBlock(A)]);
    return [header, main];
  }

  // ---- Work ---------------------------------------------------------------
  function buildWork(A, data) {
    const copy = data.pages.work;
    const header = mainMenu(A, 'work');
    const title = heading(A, A.byId('Work_page'), copy.title, 'work-title');

    const disciplines = data.disciplines.map((d) => disciplineButton(A, d));
    const disciplineGrid = h('div', { class: 'discipline-grid' },
      disciplines.filter(Boolean).map((b) => h('div', { class: 'cell' }, [b])));
    setSharedWidth(disciplineGrid, disciplines);

    const projects = data.projects.map((p) => {
      const group = A.byId(p.workLabelId);
      const centred = group ? centredLines(group) : null;
      const link = makeBlock(A, 'a', [group], {
        className: 'project-link',
        label: p.title,
        attrs: { href: `/work/${p.slug}`, 'data-slug': p.slug },
      });
      if (link && centred) {
        const art = link.querySelector('.art');
        art.classList.add('canvas-only');
        const copy = artFor([centred], link.box);
        copy.classList.add('flow-only');
        link.appendChild(copy);
      }
      anchorTo([link], 'right');
      return link;
    });
    const list = h('ul', { class: 'project-list' },
      projects.filter(Boolean).map((a) => h('li', {}, [a])));
    setSharedWidth(list, projects);

    const preview = buildPreview(A, title, disciplines, projects, header);

    const main = h('main', { class: 'page-main', id: 'main' }, [
      title,
      h('section', { class: 'work-disciplines', 'aria-labelledby': 'disciplines-heading' }, [
        h('h2', { class: 'sr-only', id: 'disciplines-heading', text: 'Disciplines' }),
        h('p', { class: 'sr-only', text: 'Choose a discipline to highlight its projects.' }),
        disciplineGrid,
      ]),
      h('section', { class: 'work-projects', 'aria-labelledby': 'projects-heading' }, [
        h('h2', { class: 'sr-only', id: 'projects-heading', text: 'Projects' }),
        list,
      ]),
      h('p', { class: 'sr-only', 'aria-live': 'polite', id: 'filter-status' }),
      preview,
      leftoverBlock(A),
    ]);
    return [header, main];
  }

  // A discipline: its name and small subtitle, drawn as in the design on
  // large screens. On small screens the name stays as drawn and the
  // subtitle becomes real text, big enough to read.
  function disciplineButton(A, d) {
    const group = A.byId(`discipline-${d.id}`);
    if (!group) return null;
    const parts = [...group.children].filter((c) => c.tagName === 'g');
    let name = null;
    if (parts.length === 2 && d.note) {
      const [a, b] = parts.map((g) => g.getBBox().height);
      name = a >= b ? parts[0] : parts[1];
    }
    const nameBox = name ? measureNodes([name], 2) : null;
    const nameCopy = name ? name.cloneNode(true) : null;

    const label = d.note ? `${d.label}: ${d.note}` : d.label;
    const button = d.href
      ? makeBlock(A, 'a', [group], {
        className: 'discipline discipline-link',
        label: `${label} (opens in a new tab)`,
        attrs: { href: d.href, target: '_blank', rel: 'noopener', 'data-id': d.id },
      })
      : makeBlock(A, 'button', [group], {
        className: 'discipline',
        label,
        attrs: { type: 'button', 'aria-pressed': 'false', 'data-id': d.id },
      });
    if (!name) return button;

    button.querySelector('.art').classList.add('canvas-only');
    const nameArt = artFor([nameCopy], nameBox);
    nameArt.classList.add('art--name', 'flow-only');
    nameArt.style.setProperty('--aw', nameBox.w);
    nameArt.style.setProperty('--ah', nameBox.h);
    button.append(
      nameArt,
      h('span', { class: 'condensed-clip flow-only', 'aria-hidden': 'true' }, [
        h('span', { class: 'condensed discipline-note', text: d.note }),
      ]),
    );
    return button;
  }

  // Project titles are drawn right-aligned. For the centred list on small
  // screens, this makes a copy with each line of a multi-line title centred.
  // Returns null for single-line titles, which need no change.
  function centredLines(group) {
    const paths = [...group.querySelectorAll('path')];
    if (paths.length < 2) return null;
    const items = paths.map((p, i) => {
      const b = p.getBBox();
      return { i, x: b.x, r: b.x + b.width, cy: b.y + b.height / 2 };
    }).sort((a, b) => a.cy - b.cy);

    // Letters on one line sit close together vertically; a jump means a new line.
    const lines = [[items[0]]];
    for (let k = 1; k < items.length; k++) {
      if (items[k].cy - items[k - 1].cy > 12) lines.push([]);
      lines[lines.length - 1].push(items[k]);
    }
    if (lines.length < 2) return null;

    const left = Math.min(...items.map((it) => it.x));
    const right = Math.max(...items.map((it) => it.r));
    const mid = (left + right) / 2;
    const copies = group.cloneNode(true).querySelectorAll('path');
    const out = document.createElementNS(SVG_NS, 'g');
    for (const line of lines) {
      const lx = Math.min(...line.map((it) => it.x));
      const lr = Math.max(...line.map((it) => it.r));
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${mid - (lx + lr) / 2} 0)`);
      for (const it of line) g.appendChild(copies[it.i]);
      out.appendChild(g);
    }
    return out;
  }

  // The big image box in the middle of the Work page (large screens only):
  // centred on the title, filling the space between the two columns.
  function buildPreview(A, title, disciplines, projects, header) {
    const d = disciplines.filter(Boolean);
    const p = projects.filter(Boolean);
    const menu = [...header.querySelectorAll('.block')];
    if (!title || !d.length || !p.length || !menu.length) return null;

    const GUTTER = 28;
    const t = title.box;
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    const cols = unionBox(d.map((b) => b.box));
    const left = cols.x + cols.w + GUTTER;
    const right = Math.min(...p.map((b) => b.box.x)) - GUTTER;
    const top = unionBox(menu.map((b) => b.box));
    const halfW = Math.min(cx - left, right - cx);
    const halfH = cy - (top.y + top.h + GUTTER);

    const preview = h('div', { class: 'block work-preview stretch canvas-only', 'aria-hidden': 'true' }, [
      h('img', { alt: '', decoding: 'async' }),
    ]);
    placeAt(preview, { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 }, A);
    return preview;
  }

  // ---- Project ------------------------------------------------------------
  function buildProject(A, data, project) {
    const close = makeBlock(A, 'a', [A.byId('close-button')], {
      pad: 8, className: 'close-link', label: 'Back to work', attrs: { href: '/work' },
    });
    anchorTo([close], 'right-top');
    const header = h('header', { class: 'site-header site-header--project' }, [close]);

    // The title is the first group made only of lettering.
    const titleGroup = [...A.svg.querySelectorAll('g')].find((g) =>
      g.children.length && [...g.children].every((c) => c.tagName === 'path') && !g.closest('[id="close-button"]'));
    const title = heading(A, titleGroup, project.title, 'project-title');
    anchorTo([title], 'left-top');

    const info = projectInfo(A, project);
    const gallery = buildGallery(A, project);
    anchorTo([gallery], 'right-top');

    const main = h('main', { class: 'page-main', id: 'main' }, [title, info, gallery, leftoverBlock(A)]);
    return [header, main];
  }

  // Year, roles and description as real text. The words come from
  // data/site.json (edit them there, and add as much as you like); the
  // design only decides where they sit and how big they are. Anything
  // missing from site.json falls back to the text drawn in the SVG.
  function projectInfo(A, project) {
    const texts = [...A.svg.querySelectorAll('text')];
    const drawn = texts.map((t) => {
      const spans = [...t.querySelectorAll('tspan')];
      return {
        box: drawnBox(t),
        size: parseFloat(t.getAttribute('font-size')) || 20,
        lines: (spans.length ? spans : [t]).map((sp) => sp.textContent.trim()).filter(Boolean),
      };
    });
    texts.forEach((t) => t.remove());
    const [yearD, rolesD, descD] = drawn;

    const year = project.year || (yearD ? yearD.lines.join(' ') : '');
    const roles = project.roles || (rolesD ? rolesD.lines : []);
    const description = [].concat(project.description || (descD ? descD.lines.join(' ') : []));

    const info = h('div', { class: 'block project-info' });
    if (!drawn.length) return info;

    const bottom = A.vb.y + A.vb.h - 40;
    const box = unionBox(drawn.map((d) => d.box));
    const right = descD ? descD.box.x + descD.box.w + 16 : box.x + box.w;
    placeAt(info, { x: box.x, y: box.y, w: right - box.x, h: bottom - box.y }, A);
    anchorTo([info], 'left-top');

    // Each part sits where it is drawn, relative to the info block.
    const part = (el, d, full) => {
      if (!d) return el;
      el.style.setProperty('--ox', d.box.x - box.x);
      el.style.setProperty('--oy', d.box.y - box.y);
      el.style.setProperty('--ow', full ? right - d.box.x : d.box.w + 16);
      el.style.setProperty('--oh', bottom - d.box.y);
      el.style.setProperty('--fs', d.size);
      return el;
    };
    if (year) info.appendChild(part(h('p', { class: 'project-year', text: year }), yearD));
    if (roles.length) info.appendChild(part(h('ul', { class: 'project-roles', 'aria-label': 'Roles' }, roles.map((r) => h('li', { text: r }))), rolesD, true));
    if (description.length) info.appendChild(part(h('div', { class: 'project-description' }, description.map((t) => h('p', { text: t }))), descD, true));
    return info;
  }

  // Replaces the two black boxes with a gallery. On large screens it sits
  // exactly where they are drawn and scrolls on its own; on small screens
  // images stack at their natural shape.
  function buildGallery(A, project) {
    const primary = A.byId('media-primary');
    const secondary = A.byId('media-secondary');
    if (!primary || !secondary) return null;

    const n = (el, a) => parseFloat(el.getAttribute(a));
    const p = { x: n(primary, 'x'), y: n(primary, 'y'), w: n(primary, 'width'), h: n(primary, 'height') };
    const s = { x: n(secondary, 'x'), y: n(secondary, 'y'), w: n(secondary, 'width'), h: n(secondary, 'height') };
    const box = unionBox([p, s]);
    const total = box.h;
    primary.remove();
    secondary.remove();
    if (project.gallery === false) return null; // this project has no images

    const gallery = h('section', { class: 'block gallery', 'aria-label': `${project.title}: images` });
    placeAt(gallery, box, A);
    gallery.style.setProperty('--gap', (s.y - (p.y + p.h)) / total);

    const frames = { primary: p, secondary: s };
    const media = project.media && project.media.length
      ? project.media
      : [{ size: 'primary' }, { size: 'secondary' }]; // placeholders

    media.forEach((item, i) => {
      const key = typeof item.size === 'string' && frames[item.size] ? item.size : (i % 2 === 0 ? 'primary' : 'secondary');
      const frame = frames[key];
      const size = typeof item.size === 'number' ? item.size : frame.h / total;
      const fig = h('figure', { class: 'gallery__item' });
      fig.style.setProperty('--size', size);
      fig.style.setProperty('--ratio', `${frame.w} / ${size * total}`);
      if (item.fit === 'contain') fig.classList.add('gallery__item--contain');

      if (item.src) {
        fig.classList.add('has-media');
        const isVideo = /\.(mp4|webm|mov)$/i.test(item.src) || item.src.startsWith('data:video');
        const media = isVideo
          ? h('video', { src: item.src, muted: true, loop: true, autoplay: true, playsinline: true, 'aria-label': item.alt || null })
          : h('img', { src: item.src, alt: item.alt || '', loading: i < 2 ? 'eager' : 'lazy', decoding: 'async' });
        if (isVideo) media.muted = true;
        fig.appendChild(media);
      } else {
        fig.setAttribute('aria-hidden', 'true');
      }
      gallery.appendChild(fig);
    });
    return gallery;
  }

  // ---- Work page behaviour ----------------------------------------------
  function wireWork(main, data) {
    const links = new Map([...main.querySelectorAll('.project-link')].map((a) => [a.dataset.slug, a]));
    const buttons = new Map([...main.querySelectorAll('.discipline')].map((b) => [b.dataset.id, b]));
    const byId = new Map(data.disciplines.map((d) => [d.id, d]));
    const status = main.querySelector('#filter-status');
    let selected = null;

    // Projects outside a discipline blur and stop being clickable.
    const show = (d) => {
      const mapped = d && d.projects && d.projects.length > 0;
      links.forEach((a, slug) => {
        const off = mapped && !d.projects.includes(slug);
        a.classList.toggle('is-dimmed', off);
        if (off) {
          a.setAttribute('aria-disabled', 'true');
          a.setAttribute('tabindex', '-1');
        } else {
          a.removeAttribute('aria-disabled');
          a.removeAttribute('tabindex');
        }
      });
    };

    const select = (d) => {
      selected = d;
      buttons.forEach((b, id) => b.setAttribute('aria-pressed', String(!!d && id === d.id)));
      show(d);
      if (!status) return;
      if (!d) status.textContent = 'Showing all projects.';
      else if (d.projects && d.projects.length) status.textContent = `${d.label}: ${d.projects.length} of ${links.size} projects highlighted.`;
      else status.textContent = `${d.label} selected.`;
    };

    buttons.forEach((b, id) => {
      const d = byId.get(id);
      b.addEventListener('mouseenter', () => show(d));
      b.addEventListener('mouseleave', () => show(selected));
      if (b.tagName === 'BUTTON') b.addEventListener('click', () => select(selected === d ? null : d));
    });

    // Clicking empty space or pressing Esc clears the selection.
    main.addEventListener('click', (e) => {
      if (!e.target.closest('.discipline, a')) select(null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selected) select(null);
    }, { signal: pageSignal() });

    // Hovering a project shows its preview in the middle (large screens).
    const preview = main.querySelector('.work-preview');
    if (!preview) return;
    const img = preview.querySelector('img');
    const bySlug = new Map(data.projects.map((p) => [p.slug, p]));
    links.forEach((a, slug) => {
      const src = bySlug.get(slug).preview;
      if (src) new Image().src = src; // preload
      const hide = () => preview.classList.remove('is-visible');
      const reveal = () => {
        if (a.classList.contains('is-dimmed')) return hide();
        if (src) img.src = src; else img.removeAttribute('src');
        preview.classList.toggle('has-image', !!src);
        preview.classList.add('is-visible');
      };
      a.addEventListener('mouseenter', reveal);
      a.addEventListener('mouseleave', hide);
      a.addEventListener('focus', reveal);
      a.addEventListener('blur', hide);
    });
  }

  // ---- Render -------------------------------------------------------------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fadeMs = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fade')) || 0;

  async function render({ animate = true } = {}) {
    const token = ++renderToken;
    const route = matchRoute(currentPath());
    if (!route) return navigate('/', { replace: true });

    const data = await getSiteData();
    let project = null;
    if (route.page === 'project') {
      project = data.projects.find((p) => p.slug === route.slug);
      if (!project) return navigate('/work', { replace: true });
      route.title = `${project.title} · Zaira Christa`;
    }

    const A = await loadArtwork(route.svg);
    let parts;
    try {
      if (route.page === 'home') parts = buildHome(A, data);
      else if (route.page === 'about') parts = buildAbout(A, data);
      else if (route.page === 'work') parts = buildWork(A, data);
      else parts = buildProject(A, data, project);
    } finally {
      A.dispose();
    }
    const page = h('div', { class: `page page--${route.page}` }, parts);
    page.style.setProperty('--dw', A.vb.w);
    page.style.setProperty('--dh', A.vb.h);

    if (animate && stage.childElementCount) {
      stage.classList.add('is-leaving');
      await wait(fadeMs());
    }
    if (token !== renderToken) return; // a newer navigation won

    if (pageAbort) pageAbort.abort();
    pageAbort = new AbortController();
    stage.replaceChildren(page);
    stage.dataset.page = route.page;
    document.title = route.title;

    if (route.page === 'work') wireWork(page, data);
    if (route.page === 'home') {
      const t = page.querySelector('.home-title');
      if (t && t.startFlash) t.startFlash(pageAbort.signal);
    }

    stage.classList.remove('is-leaving');
    if (animate) {
      // Start the new page at the top, and tell screen readers where we are.
      window.scrollTo(0, 0);
      const h1 = page.querySelector('h1');
      if (h1) h1.focus({ preventScroll: true });
    }
  }

  function navigate(href, { replace = false } = {}) {
    const url = new URL(href, location.origin);
    if (url.pathname === currentPath() && !replace) return;
    if (STATIC) staticPath = url.pathname;
    else history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname);
    render();
  }

  // ---- Events -------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href === '/cv') return;
    if (a.getAttribute('target') === '_blank') return;
    if (STATIC) { e.preventDefault(); navigate(href); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  });

  window.addEventListener('popstate', () => render());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stage.dataset.page === 'project') navigate('/work');
  });

  // ---- Day / night ----------------------------------------------------------
  const toggle = document.getElementById('theme-toggle');
  const syncToggle = () => {
    const night = document.documentElement.dataset.mode === 'night';
    toggle.setAttribute('aria-pressed', String(night));
    toggle.setAttribute('aria-label', night ? 'Switch to day mode' : 'Switch to night mode');
  };
  toggle.addEventListener('click', () => {
    const night = document.documentElement.dataset.mode !== 'night';
    if (night) document.documentElement.dataset.mode = 'night';
    else delete document.documentElement.dataset.mode;
    try { localStorage.setItem('theme', night ? 'night' : 'day'); } catch (e) {}
    syncToggle();
  });
  syncToggle();

  // ---- First-visit loader ---------------------------------------------------
  // Counts 001% → 100% one step at a time: slow at the ends, quicker in the
  // middle (about 4 seconds), then the site fades in underneath.
  function runLoader(siteReady) {
    const loader = document.getElementById('loader');
    if (!loader || document.documentElement.dataset.loader === 'skip') return;
    const count = loader.querySelector('.loader__count');
    const stepDelay = (n) => 20 + 38 * (1 - Math.sin((Math.PI * n) / 100));

    let n = 1;
    const tick = async () => {
      if (n < 100) {
        n += 1;
        count.textContent = `${String(n).padStart(3, '0')}%`;
        loader.setAttribute('aria-valuenow', n);
        setTimeout(tick, stepDelay(n));
        return;
      }
      await siteReady;
      await wait(400); // let 100% sit for a beat
      loader.classList.add('is-done');
      try { sessionStorage.setItem('loaded', '1'); } catch (e) {}
      setTimeout(() => loader.remove(), 800);
    };
    setTimeout(tick, stepDelay(1));
  }

  const firstRender = render({ animate: false });
  runLoader(firstRender.catch(() => {}));
  firstRender.then(() => {
    // Warm the cache for the main pages so switching is instant.
    ['/svg/home.svg', '/svg/about.svg', '/svg/work.svg'].forEach((u) => getSvgText(u).catch(() => {}));
  });
})();
