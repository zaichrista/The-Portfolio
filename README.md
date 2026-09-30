# Zaira Christa: Portfolio

A portfolio built directly from the original SVG designs. Each design is cut into pieces (title, menu words, projects, disciplines…) and rebuilt as accessible HTML, keeping the original outlined lettering.

## Two layouts, one page

- **Large landscape screens** (at least 900 × 600 and wider than tall): the design, spread to fill the window, no scrolling. Nothing is ever stretched out of shape: each piece scales evenly around an anchor point (for example, right-aligned project titles keep their right edge in place), and pieces that belong together move as one. Very wide screens stop spreading at 2.2 : 1.
- **Phones, portrait tablets and zoomed-in browsers**: the same pieces stack into a readable column. Lettering is scaled evenly (never squashed), paragraphs become real Times New Roman condensed to match the design, and photos keep their shape. These pages scroll when the content needs it.

The switch point is the media query at the top of `public/css/style.css`.

## Accessibility

Real headings, links, buttons and lists; every drawn word has a text equivalent for screen readers; visible keyboard focus; Esc clears a discipline or closes a project; photos have alt text; motion stops for people who ask for reduced motion; nothing scrolls sideways at 320px wide.

## Run it

```bash
npm install
npm run dev        # restarts when server.js changes
# open http://localhost:3000
```

Requires Node 18+.

## Pages

| URL                  | Design file                          |
| -------------------- | ------------------------------------ |
| `/`                  | `public/svg/home.svg`                |
| `/about`             | `public/svg/about.svg`               |
| `/work`              | `public/svg/work.svg`                |
| `/work/<project>`    | `public/svg/projects/<project>.svg`  |

To change a page's design, export a new SVG from Illustrator and replace the file. **Keep the layer names (ids)**, because the code uses them to find things:

- Menu: `menu-home`, `menu-about`, `menu-work`
- Home: `home-cv` (links to your CV)
- About: the photo is the `<image>`; lettering on the right half is the title, on the left half the body
- Work: `Work_page` (title), `discipline-thinking`, `discipline-strategy`, `discipline-fashion-design`, `discipline-graphic-design`, `discipline-social-media`, `discipline-writing`, plus one group per project (e.g. `Void_Studios`, `Muni`)
- Project pages: `close-button`, `media-primary`, `media-secondary`

## Editing project text

Each project's year, roles and description live in `data/site.json`, and you can change them or add more:

```json
{
  "slug": "muni",
  "year": "2026",
  "roles": ["Brand strategy", "Creative direction", "Graphic design", "Visual identity"],
  "description": [
    "First paragraph.",
    "A second paragraph, as long as you like."
  ]
}
```

The design decides where the text sits and how big it is. On large screens a long description scrolls within its space; on phones the page simply gets longer. If a field is removed, the text drawn in the project's SVG is used instead.

## Page copy

The words drawn in the SVGs are also written out in `data/site.json` under `pages` (and each discipline's `note`). That text is what phones show for paragraphs and what screen readers read, so **when you change wording in a design, change it there too**.

## Adding images to a project

1. Put the files in `public/assets/projects/<project>/`.
2. List them in `data/site.json`:

```json
{
  "slug": "bekaa",
  "media": [
    { "src": "/assets/projects/bekaa/01.jpg", "alt": "Bekaa identity on packaging" },
    { "src": "/assets/projects/bekaa/02.jpg", "alt": "Poster series" },
    { "src": "/assets/projects/bekaa/03.mp4" }
  ]
}
```

Images fill the black boxes from the design and the image column scrolls on its own. Sizes alternate between the two box heights from the design. Optional per item:

- `"size": "primary"` or `"secondary"`: use a specific box height
- `"size": 0.6`: a custom height, as a share of the visible column
- `"fit": "contain"`: show the whole image instead of cropping to fill

With no media listed, the black placeholders show.

## Linking disciplines to projects

In `data/site.json`, add project slugs to a discipline:

```json
{ "id": "strategy", "label": "Strategy", "projects": ["void-studios", "zc-studios", "the-reach-brasserie"] }
```

Hovering a discipline previews it; **clicking** selects it (the word turns red). Its projects stay sharp; the rest blur and can't be clicked. Click it again, click empty space, or press Esc to clear. Disciplines with an empty list don't blur anything.

## Work page preview image

Hovering a project shows a large image in the middle of the Work page, underneath "THIS IS WHAT I DO". Set it per project:

```json
{ "slug": "bekaa", "preview": "/assets/projects/bekaa/preview.jpg", "media": [] }
```

With no `preview`, a grey placeholder box shows.

## CV

Save your CV as `public/assets/cv/cv.pdf`. The CV circle on the home page opens it in a new tab.

## Day / night

The sun in the top-left corner switches the site to night mode (it becomes a moon): ivory and off-black swap everywhere, including the empty placeholder boxes. Photos and videos are never inverted. The choice is remembered in the visitor's browser. Night colours are the `:root[data-mode="night"]` block at the top of `public/css/style.css`.

## Loader

On a visitor's first load, an ivory screen counts `001%` → `100%` in stretched Times New Roman (about 4 seconds), then the site fades in. It plays once per browser session. Speed: `stepDelay` in `runLoader` (`public/js/app.js`). Size and stretch: `.loader__count` in `public/css/style.css`.

## Static build (no server)

```bash
npm run build:static
```

Packs the whole site (pages, data, images, code) into one file, `dist/index.html`, that works with no server. Use it for preview links or static hosts like GitHub Pages or Netlify. In this mode pages switch without changing the URL, and the CV link is hidden.

## Settings

- **Stretch vs. keep proportions**: in `public/index.html`, `data-fit="stretch"` stretches the design to any window; change it to `data-fit="contain"` to keep the 1280 × 1024 proportions, centred.
- **Hover colour, blur strength, preview placeholder colour, CV ring speed, fade speed**: variables at the top of `public/css/style.css`.

## Structure

```
server.js              Express server: pages, /api/site, /api/projects/:slug, /cv
data/site.json     Projects, their images, and discipline links
public/index.html      The page shell
public/css/style.css   Stretch, hover, blur, gallery
public/js/app.js       Loads each SVG and makes it interactive
public/svg/            The designs
public/assets/         Images, CV
```
