# CLAUDE.md

## What this is

A demonstration of AI-enabled operating systems for insurance and legal work,
built for an executive audience that knows the domain cold.

The site makes one argument and proves one instance of it:

> AI isn't possible for entire businesses. Certain **workflows** are.
> **Processes** are, with some human interaction.

Two layers:

- **`index.html`** — the thesis and the claims-to-capital backbone map. Each step
  in the backbone is marked *autonomous*, *human-in-the-loop*, or *human*. The
  map's value is that it makes a falsifiable claim about where the line sits.
- **`program/`** — one node of that map opened all the way up. Messy synthetic
  loss runs are ingested, reconciled with exceptions flagged, analyzed for
  aggregate erosion and reserve development, and drafted into a quarterly board
  capacity memo in which every figure links back to its source row.

The audience receives reports like these already. Depth is mandatory.
Hand-waving gets caught in the room.

## Hard rules

These are constraints, not preferences. Breaking one breaks the premise.

**No build step.** Plain HTML, CSS, and ES modules served as-is. No bundler, no
transpiler, no framework, no `package.json`, no CI. Deploy is `git push` to
`main`; GitHub Pages serves the repo root.

**No backend, no live model calls.** The site is static. An API key in client JS
is an exposed API key. Everything is pre-computed and deterministic. This is a
feature — no latency, no per-run cost, nothing leaves the browser, and it
behaves identically every time it is presented live.

**Say that it's a demonstration.** The synthetic-data and demonstration-environment
labeling is visible on the page, not buried in a footnote. Discovered rather than
disclosed, it becomes a credibility hole.

**Synthetic data only.** Every claim, insured, and figure is generated from a
seed in this repo. Nothing derives from any real book — not anonymized, not
"modeled on," not reshaped. This holds regardless of employer sanction: a demo
that may be shown to one insured cannot contain another's data.

**Every figure is traceable.** No number appears in the memo or the analysis
without a link back to the source rows that produced it. If a figure can't be
traced, it doesn't ship. This is the whole argument — remove traceability and
the site is just another AI demo.

**Keep the caught error.** The pipeline contains a deliberate failure: a
duplicate claim number under a variant entity spelling reads as a new claim and
would overstate aggregate erosion. Reconciliation flags it, a human confirms,
the figure corrects, and the entire chain stays visible in the governance log.

Do not remove this to make the demo look stronger. It is the single most
persuasive element on the site. A system that never shows its failure mode reads
as unserious to anyone who has run one.

**No personal framing.** No bio, no title, no photo, no first person about the
author. The site is the artifact. It may be presented by or through an employer,
which makes personal branding actively wrong. Keep it portable — relative paths,
no personal chrome — so it can move to a company domain without a rewrite.

**Numbers discipline.** Every figure either cites a named public benchmark or
derives live from user-entered inputs. No invented savings numbers presented as
findings. Where no benchmark exists, the UI says "illustrative" on the field
itself. A fabricated figure that a CFO probes and finds hollow ends the meeting.

## Architecture

```
index.html              thesis + backbone map
program/index.html      the deep node
assets/css/tokens.css   design tokens
assets/css/base.css     typography, layout primitives
assets/js/generate.js   deterministic synthesis of the claim population
assets/js/reconcile.js  normalization + exception flagging
assets/js/projection.js erosion, reserve, capital model
assets/js/memo.js       memo assembly + traceability links
assets/js/trace.js      governance log panel
assets/js/pipeline.js   stage state / step-through
assets/js/render.js     pure data → DOM helpers
data/program-001.json   program parameters, seed, planted anomalies, citations
```

`data/program-001.json` holds parameters and the hand-authored anomaly rows; the
bulk claim population is synthesized deterministically from the seed at load
time. Keeping the file to parameters rather than 2,000 literal rows keeps it
reviewable, and the interesting rows stay explicit.

**A second workflow is a new data file plus modest renderer work, not a rewrite.**
Preserve that property. Renderers take data and return DOM; they do not reach
into a specific program's shape.

## Design

Light, high-contrast, editorial. Deliberately *not* the dark-neon AI-startup
look, which reads as vendor to this audience.

System serif for headings (`ui-serif, Georgia`), system sans for body. Zero
webfonts: no network dependency, no privacy surface, instant load. One restrained
accent, used only for traceability links and confidence states — if the accent
appears anywhere else it stops meaning anything.

Verify at 1440px, 1024px, and 390px. This gets opened on a phone in a hallway.

## Voice

Plain and concrete. Never breathless.

Write "the reconciliation flagged eleven exceptions" — not "AI-powered data
integrity intelligence." State what happens and what it cost. The audience is
skeptical by profession and reacts badly to product language.

## Verification

Run the local server before believing anything:

```bash
python .claude/devserver.py 8080
```

It sends `no-store` deliberately. A cached ES module once let a verification pass
run against the previous version of the code and report success. Do not
substitute `python -m http.server`.

Before calling work done:

1. Both pages load with no console errors.
2. Every planted defect surfaces as a visible exception.
3. Every memo figure links to its source row.
4. The caught-error chain appears end to end in the governance log.
5. Changing any assumption input recomputes downstream outputs — no hardcoded
   number survives.
6. Zero external network requests in the Network tab.
7. After pushing, check the deployed URL directly. A clean local run has
   previously masked a broken deploy in this repo.
