/* ==========================================================================
   Zaira Christa: portfolio
   Loads each page's SVG design into the stage and wires up the parts
   that are clickable (menu, projects, close ✕, CV) using the SVG ids.
   ========================================================================== */
(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const stage = document.getElementById('stage');
  const svgCache = new Map();
  let siteData = null;
  let renderToken = 0;
  let pageAbort = null;
  const pageSignal = () => pageAbort.signal;

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
    if (!siteData) {
      const res = await fetch('/api/site');
      siteData = await res.json();
    }
    return siteData;
  }

  async function getSvgText(url) {
    if (!svgCache.has(url)) {
      svgCache.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${url}`);
        return r.text();
      }));
    }
    return svgCache.get(url);
  }

  async function buildSvg(url) {
    const text = await getSvgText(url);
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = document.importNode(doc.documentElement, true);
    svg.removeAttribute('id');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    // Stretch the artwork to whatever box the stage is (see style.css).
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    return svg;
  }

  // ---- SVG helpers ----------------------------------------------------------
  // A transparent box behind a group so the whole label is hoverable,
  // not just the ink of the letters.
  function addHitArea(group, pad = 4) {
    const box = group.getBBox();
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'hit');
    rect.setAttribute('x', box.x - pad);
    rect.setAttribute('y', box.y - pad);
    rect.setAttribute('width', box.width + pad * 2);
    rect.setAttribute('height', box.height + pad * 2);
    group.insertBefore(rect, group.firstChild);
  }

  // Wraps an SVG group in an <a> so it behaves like a real link
  // (keyboard, right-click → open in new tab, etc.).
  function linkGroup(svg, id, href, { className = '', label = '', newTab = false } = {}) {
    const group = byId(svg, id);
    if (!group) return null;
    const a = document.createElementNS(SVG_NS, 'a');
    a.setAttribute('href', href);
    if (className) a.setAttribute('class', className);
    if (label) a.setAttribute('aria-label', label);
    if (newTab) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    }
    group.parentNode.insertBefore(a, group);
    a.appendChild(group);
    addHitArea(group);
    return a;
  }

  function byId(svg, id) {
    return svg.querySelector(`[id="${id}"]`);
  }

  // ---- Page setup -----------------------------------------------------------
  function setupMenu(svg) {
    linkGroup(svg, 'menu-home', '/', { className: 'menu-link', label: 'Home' });
    linkGroup(svg, 'menu-about', '/about', { className: 'menu-link', label: 'About' });
    linkGroup(svg, 'menu-work', '/work', { className: 'menu-link', label: 'Work' });
  }

  function setupHome(svg) {
    setupMenu(svg);
    linkGroup(svg, 'home-cv', '/cv', { className: 'cv-link', label: 'CV', newTab: true });
  }

  function setupAbout(svg) {
    setupMenu(svg);
  }

  function setupWork(svg, data) {
    setupMenu(svg);

    // Blur filter used for projects outside a hovered discipline.
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML =
      '<filter id="dim-blur" x="-10%" y="-40%" width="120%" height="180%">' +
      '<feGaussianBlur stdDeviation="2.5"/></filter>';
    svg.insertBefore(defs, svg.firstChild);

    const links = new Map();
    for (const p of data.projects) {
      const a = linkGroup(svg, p.workLabelId, `/work/${p.slug}`, {
        className: 'project-link',
        label: p.title,
      });
      if (a) links.set(p.slug, a);
    }

    setupPreview(svg, data, links);

    // Disciplines: hover previews, click selects (the word turns red).
    // Projects outside the discipline blur and stop being clickable.
    // Which projects belong to which discipline lives in data/projects.json.
    const disciplines = new Map();
    let selected = null;

    const showDiscipline = (d) => {
      const mapped = d && d.projects && d.projects.length > 0;
      links.forEach((a, slug) => {
        const dimmed = mapped && !d.projects.includes(slug);
        a.classList.toggle('is-dimmed', dimmed);
        if (dimmed) {
          a.setAttribute('tabindex', '-1');
          a.setAttribute('aria-disabled', 'true');
        } else {
          a.removeAttribute('tabindex');
          a.removeAttribute('aria-disabled');
        }
      });
    };

    const select = (d) => {
      selected = d;
      disciplines.forEach((g, id) => g.classList.toggle('is-active', !!d && id === d.id));
      showDiscipline(d);
    };

    for (const d of data.disciplines) {
      const group = byId(svg, `discipline-${d.id}`);
      if (!group) continue;
      addHitArea(group);
      group.classList.add('discipline');
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', d.label);
      disciplines.set(d.id, group);

      group.addEventListener('mouseenter', () => showDiscipline(d));
      group.addEventListener('mouseleave', () => showDiscipline(selected));
      const toggle = () => select(selected === d ? null : d);
      group.addEventListener('click', toggle);
      group.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    }

    // Clicking empty space or pressing Esc clears the selection.
    svg.addEventListener('click', (e) => {
      if (!e.target.closest('.discipline, a')) select(null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') select(null);
    }, { signal: pageSignal() });
  }

  // Hovering a project shows a large image in the middle of the Work page,
  // underneath "THIS IS WHAT I DO". The box is centred on the title and
  // fills the space between the two columns.
  function setupPreview(svg, data, links) {
    const title = byId(svg, 'Work_page');
    const columns = byId(svg, 'Disciplines');
    const menu = byId(svg, 'Menu_bars');
    if (!title || !columns || !menu || links.size === 0) return;

    const GUTTER = 28; // design units (the SVG is 1280 × 1024)
    const t = title.getBBox();
    const cx = t.x + t.width / 2;
    const cy = t.y + t.height / 2;
    const leftEdge = columns.getBBox().x + columns.getBBox().width + GUTTER;
    const rightEdge = Math.min(...[...links.values()].map((a) => a.getBBox().x)) - GUTTER;
    const topEdge = menu.getBBox().y + menu.getBBox().height + GUTTER;
    const halfW = Math.min(cx - leftEdge, rightEdge - cx);
    const halfH = cy - topEdge;

    const vb = svg.viewBox.baseVal;
    const preview = document.createElement('div');
    preview.className = 'work-preview';
    preview.setAttribute('aria-hidden', 'true');
    Object.assign(preview.style, {
      left: `${((cx - halfW - vb.x) / vb.width) * 100}%`,
      top: `${((cy - halfH - vb.y) / vb.height) * 100}%`,
      width: `${((halfW * 2) / vb.width) * 100}%`,
      height: `${((halfH * 2) / vb.height) * 100}%`,
    });
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    preview.appendChild(img);
    stage.insertBefore(preview, svg); // underneath the SVG, so the title sits on top

    const bySlug = new Map(data.projects.map((p) => [p.slug, p]));
    links.forEach((a, slug) => {
      const src = bySlug.get(slug).preview;
      if (src) new Image().src = src; // preload
      const show = () => {
        if (a.classList.contains('is-dimmed')) return hide();
        if (src) img.src = src; else img.removeAttribute('src');
        preview.classList.toggle('has-image', !!src);
        preview.classList.add('is-visible');
      };
      const hide = () => preview.classList.remove('is-visible');
      a.addEventListener('mouseenter', show);
      a.addEventListener('mouseleave', hide);
      a.addEventListener('focus', show);
      a.addEventListener('blur', hide);
    });
  }

  function setupProject(svg, project) {
    linkGroup(svg, 'close-button', '/work', { className: 'close-link', label: 'Close' });
    buildGallery(svg, project);
  }

  // Replaces the two black boxes in the design with a gallery that sits in
  // exactly the same place and scrolls on its own.
  function buildGallery(svg, project) {
    const primary = byId(svg, 'media-primary');
    const secondary = byId(svg, 'media-secondary');
    if (!primary || !secondary) return;

    const n = (el, a) => parseFloat(el.getAttribute(a));
    const p = { x: n(primary, 'x'), y: n(primary, 'y'), w: n(primary, 'width'), h: n(primary, 'height') };
    const s = { x: n(secondary, 'x'), y: n(secondary, 'y'), w: n(secondary, 'width'), h: n(secondary, 'height') };

    const vb = svg.viewBox.baseVal;
    const left = Math.min(p.x, s.x);
    const top = p.y;
    const right = Math.max(p.x + p.w, s.x + s.w);
    const bottom = s.y + s.h;
    const total = bottom - top;

    const gallery = document.createElement('div');
    gallery.className = 'gallery';
    gallery.setAttribute('aria-label', `${project.title}: images`);
    Object.assign(gallery.style, {
      left: `${((left - vb.x) / vb.width) * 100}%`,
      top: `${((top - vb.y) / vb.height) * 100}%`,
      width: `${((right - left) / vb.width) * 100}%`,
      height: `${(total / vb.height) * 100}%`,
    });

    // Sizes from the design, as a share of the gallery's visible height.
    const sizes = { primary: p.h / total, secondary: s.h / total };
    const gap = (s.y - (p.y + p.h)) / total;

    const media = project.media && project.media.length
      ? project.media
      : [{ size: 'primary' }, { size: 'secondary' }]; // black placeholders

    media.forEach((item, i) => {
      const fig = document.createElement('figure');
      fig.className = 'gallery__item';
      if (item.fit === 'contain') fig.classList.add('gallery__item--contain');

      const size = typeof item.size === 'number'
        ? item.size
        : sizes[item.size] ?? (i % 2 === 0 ? sizes.primary : sizes.secondary);
      fig.style.height = `${size * 100}%`;
      fig.style.flex = `0 0 ${size * 100}%`;

      if (item.src) {
        fig.classList.add('has-media');
        const isVideo = /\.(mp4|webm|mov)$/i.test(item.src);
        const el = document.createElement(isVideo ? 'video' : 'img');
        el.src = item.src;
        if (isVideo) {
          Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true });
        } else {
          el.alt = item.alt || '';
          el.loading = i < 2 ? 'eager' : 'lazy';
          el.decoding = 'async';
        }
        fig.appendChild(el);
      }
      gallery.appendChild(fig);
    });

    Object.assign(gallery.style, {
      display: 'flex',
      flexDirection: 'column',
      rowGap: `${gap * 100}%`,
    });

    primary.remove();
    secondary.remove();
    stage.appendChild(gallery);
  }

  // ---- Render -------------------------------------------------------------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fadeMs = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fade')) || 0;

  async function render({ animate = true } = {}) {
    const token = ++renderToken;
    const route = matchRoute(location.pathname);
    if (!route) return navigate('/', { replace: true });

    const data = await getSiteData();
    let project = null;
    if (route.page === 'project') {
      project = data.projects.find((p) => p.slug === route.slug);
      if (!project) return navigate('/work', { replace: true });
      route.title = `${project.title} · Zaira Christa`;
    }

    const [svg] = await Promise.all([
      buildSvg(route.svg),
      animate && stage.childElementCount ? (stage.classList.add('is-leaving'), wait(fadeMs())) : null,
    ]);
    if (token !== renderToken) return; // a newer navigation won

    if (pageAbort) pageAbort.abort();
    pageAbort = new AbortController();
    stage.replaceChildren(svg);
    stage.dataset.page = route.page;
    document.title = route.title;
    svg.setAttribute('aria-label', route.title);

    if (route.page === 'home') setupHome(svg);
    else if (route.page === 'about') setupAbout(svg);
    else if (route.page === 'work') setupWork(svg, data);
    else if (route.page === 'project') setupProject(svg, project);

    stage.classList.remove('is-leaving');
  }

  function navigate(href, { replace = false } = {}) {
    const url = new URL(href, location.origin);
    if (url.pathname === location.pathname && !replace) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname);
    render();
  }

  // ---- Events -------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.classList.contains('is-dimmed')) { e.preventDefault(); return; }
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || href === '/cv') return;
    if (a.getAttribute('target') === '_blank') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  });

  window.addEventListener('popstate', () => render());

  // ---- Day / night ----------------------------------------------------------
  const toggle = document.getElementById('theme-toggle');
  const syncToggle = () => {
    const night = document.documentElement.dataset.theme === 'night';
    toggle.setAttribute('aria-pressed', String(night));
    toggle.setAttribute('aria-label', night ? 'Switch to day mode' : 'Switch to night mode');
  };
  toggle.addEventListener('click', () => {
    const night = document.documentElement.dataset.theme !== 'night';
    if (night) document.documentElement.dataset.theme = 'night';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('theme', night ? 'night' : 'day'); } catch (e) {}
    syncToggle();
  });
  syncToggle();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stage.dataset.page === 'project') navigate('/work');
  });

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
