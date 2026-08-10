# nealpathak.github.io

Personal site. Static, zero-build, no dependencies — plain HTML, CSS, and ES modules
served directly by GitHub Pages.

## Structure

```
index.html              Landing page
404.html                Not-found page
assets/css/site.css     Design system: tokens, type, layout, components
assets/css/tool.css     Tool-page chrome: workbench layout, data grids, panels
assets/js/fmt.js        Number, currency, duration, and percent formatting
assets/js/csv.js        CSV parse and serialize
assets/js/chart.js      Hand-rolled SVG charts (bar, cumulative line, tornado)
tools/<slug>/index.html Tool page
tools/<slug>/model.js   Pure calculation layer, no DOM
tools/<slug>/app.js     DOM wiring
tools/<slug>/samples.js Synthetic sample datasets
```

Calculation layers are kept free of DOM references so they can be tested or reused
directly.

## Local preview

Any static server works. From the repo root:

```bash
python -m http.server 8000
```

## Data

Every dataset in this repository is synthetic. Nothing here is derived from, or
representative of, any real book of business, claim, matter, or employer.
