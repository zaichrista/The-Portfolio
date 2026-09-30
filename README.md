# Zaira Christa: Portfolio

A no-scroll portfolio. Every page is one of the original SVG designs, drawn to fill the window exactly, with the menu, projects, CV and close ✕ made clickable.

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
- Work: `discipline-thinking`, `discipline-strategy`, `discipline-fashion-design`, `discipline-graphic-design`, `discipline-social-media`, `discipline-writing`, plus one group per project (e.g. `Void_Studios`, `Muni`)
- Project pages: `close-button`, `media-primary`, `media-secondary`

## Adding images to a project

1. Put the files in `public/assets/projects/<project>/`.
2. List them in `data/projects.json`:

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

In `data/projects.json`, add project slugs to a discipline:

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

## Settings

- **Stretch vs. keep proportions**: in `public/index.html`, `data-fit="stretch"` stretches the design to any window; change it to `data-fit="contain"` to keep the 1280 × 1024 proportions, centred.
- **Hover colour, blur strength, preview placeholder colour, CV ring speed, fade speed**: variables at the top of `public/css/style.css`.

## Structure

```
server.js              Express server: pages, /api/site, /api/projects/:slug, /cv
data/projects.json     Projects, their images, and discipline links
public/index.html      The page shell
public/css/style.css   Stretch, hover, blur, gallery
public/js/app.js       Loads each SVG and makes it interactive
public/svg/            The designs
public/assets/         Images, CV
```
