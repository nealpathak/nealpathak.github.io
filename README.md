# nealpathak.github.io

One insurance workflow, run twice. The annual renewal of a captive insurer,
seven steps from the first data request to the bound policy, shown as it is
usually done and then as a pipeline: deterministic engines for the numbers, a
language model where there is text to read or write, and a person at four
named gates. A clock and a cost meter run on both. Every artifact is produced
live from a synthetic book; every hour, rate and fee is an assumption the
reader can change.

Live at https://nealpathak.github.io

## How it is built

Plain HTML, CSS and ES modules. No framework, no build step, no backend, no
dependencies. Charts are hand-rolled SVG. The book and every dataset are
generated from seeds committed here; nothing derives from any real insurer,
insured, claimant, administrator, reinsurer or employer.

```
index.html, app.mjs            the page
assets/site.css                stylesheet
lib/                           rng, csv, formatting, svg charts, dom helpers
data/book.mjs                  the synthetic captive book (claims, policies, triangles)
engines/<name>/engine.mjs      pure computation, no DOM: pipeline, development, capital, allocation, contracts
engines/<name>/selftest.mjs    checks for each engine
renewal/model.mjs              the cost and time model: steps, roles, rates, fees, floors
renewal/data.mjs               exposure replies, adjuster notes, quotes, contract wording
renewal/runs.mjs               recorded model runs: prompt, output, and the figures each cites
renewal/selftest.mjs           checks the model, the data, and every cited figure against the engines
selftest.mjs                   runs every suite
```

## The recorded model runs

The site has no backend, so the six language-model steps are recorded: each
was run once and committed with its exact prompt and output. The test suite
recomputes every figure those outputs cite from the engines and checks that
the text still says it. If the book or an engine changes, the run fails until
it is re-recorded.

## Run locally

```
python -m http.server 8765
```

then open http://localhost:8765.

## Test

```
node selftest.mjs
```

The GitHub Actions workflow runs the full set on every push.
