# nealpathak.github.io

Working demonstrations of the systems legal, risk and insurance teams run on:
claims data pipelines, loss development and aggregate erosion, a captive
capital model, a governance layer for a fleet of AI agents, legal operations
analytics, cost of risk and premium allocation, contract insurance
requirements against the programme, and a board brief assembled from all of
them. Plus four workflow reference designs.

Live at https://nealpathak.github.io

## How it is built

Plain HTML, CSS and ES modules. No framework, no build step, no dependencies.
Charts are hand-rolled SVG. Every dataset is generated from a seed committed
to the repository; nothing derives from any real insurer, insured, client, or
employer.

```
assets/site.css                shared stylesheet
lib/                           rng, csv, formatting, svg charts, dom helpers
data/book.mjs                  the synthetic captive book (claims, policies, triangles)
tools/<tool>/engine.mjs        pure computation, no DOM
tools/<tool>/app.mjs           the page
tools/<tool>/selftest.mjs      checks for the engine
workflows/                     case studies with swim-lane diagrams
selftest.mjs                   runs every suite
```

## Run locally

```
python -m http.server 8765
```

then open http://localhost:8765. Use a server that keeps directory trailing
slashes; the pages use relative module paths.

## Test

```
node selftest.mjs
```

Each engine's suite can also be run on its own, for example
`node tools/loss-development/selftest.mjs`. The GitHub Actions workflow runs
the full set on every push.
