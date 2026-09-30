# Working on this repo

## Merging
The owner has asked for changes to be merged into `main` automatically.
After a change is committed, pushed and tested, open a pull request into
`main` and merge it without asking first. `main` is what the owner opens
in VS Code, so it should always hold the latest working site.

## Before merging
- Check the site in a browser at desktop (1280×1024) and phone (390×844)
  sizes; no console errors, no sideways scrolling.
- Rebuild the preview with `npm run build:static` if the shared preview
  link is being updated.

## Project notes
See README.md for structure. Page wording lives in `data/site.json` as
well as in the SVGs; keep them in step.
