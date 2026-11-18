# WoonZorgwijzer website (Hugo)

Hugo rebuild of https://woonzorgwijzer.nl/ with an interactive province map on the Kaartviewers page.

## Develop

```sh
hugo server          # http://localhost:1313
hugo --gc --minify   # production build into public/
```

Requires Hugo extended ≥ 0.146 (uses the new template layout and `js.Build`).

## Structure

| Path | Purpose |
|---|---|
| `content/` | Pages (Markdown). Old `*.html` URLs redirect via `aliases`. |
| `content/kaartviewers/<id>.md` | One stub per province → shareable URL `/kaartviewers/<id>/`. |
| `data/provinces.yaml` | Provinces with a viewer: name, label text, derondekaart `variant` URL. |
| `data/nlmap.json` | Generated SVG paths, label points and bounding boxes for all 12 provinces. |
| `layouts/_partials/kaart.html` | Kaartviewers page: intro, map, viewer overlay. |
| `layouts/_partials/nl-map.html` | Inline SVG map; provinces in `provinces.yaml` become links. |
| `assets/js/kaart.js` | Click → zoom into province → load viewer iframe; history/back handling. |
| `assets/css/main.css` | All styling. Map colours are the `--prov-*` variables. |
| `tools/build-map.mjs` | Regenerates `data/nlmap.json` from CBS/PDOK boundaries. |

## Adding a province viewer

1. Add an entry to `data/provinces.yaml` (key = province id from `data/nlmap.json`).
2. Add `content/kaartviewers/<id>.md` with `province: <id>` in front matter.

## Regenerating the map

```sh
node tools/build-map.mjs
```

Downloads `provincie_gegeneraliseerd` + `provincie_labelpoint` (CBS via PDOK, CC BY 4.0), projects to RD New and simplifies with mapshaper (via `npx`).
