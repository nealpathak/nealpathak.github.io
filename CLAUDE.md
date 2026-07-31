# Neal Pathak — Personal Site

## Overview
Personal site presenting decision instruments for risk, capital, and legal exposure.
**Repository**: nealpathak.github.io
**Hosting**: GitHub Pages
**Tech Stack**: Vanilla HTML/CSS/JS, Chart.js v3.9.1
**Design**: Minimal, clean, Apple/Stripe-inspired. Inter font, design tokens in shared.css.

## Positioning

**Thesis**: *"Decision instruments for the point where legal exposure meets capital allocation."*

The site targets director-level roles in risk management, captive/risk finance, and legal
operations. Its job is to make demonstrated capability legible — the work is more senior than
the job titles attached to it, and the site closes that gap by showing the work rather than
asserting seniority.

Everything is organized around **decisions**, not tool counts. Two tiers:

- **Decision instruments** (flagship) — models that end in a recommendation: Captive Feasibility,
  Risk Financing Optimizer, Legal Operating Model, Board Risk Report, Litigation Decision Tree,
  M&A Risk Scorecard, MPL Simulator.
- **Analytics toolkit** (supporting) — the analysis that feeds those decisions. Presented as
  compact rows, deliberately quieter than the instrument cards.

Plus **Notes** — short written pieces on the frameworks behind the instruments. Writing is the
strongest seniority signal the site has; each note pairs with an instrument and cross-links to it.

### Anonymity boundary
Work **domains** may be named (captive professional liability program economics, litigation and
settlement strategy, contract and claims operations). **Never** name employers, clients, program
specifics, or colleagues. No contact details beyond the LinkedIn link — no email, phone, or
location. No invented job history, and no `jobTitle` in JSON-LD; `knowsAbout` and the work itself
carry the positioning.

### Voice rules
These govern every tool header, landing card, and meta description:

1. **Decision first.** Open by naming the decision the tool supports, phrased as the question a
   functional leader actually faces. Second sentence describes mechanism. Never open with an
   imperative verb (Parse / Estimate / Render / Track / Model).
2. **Peer voice.** Never "Built for [personas] who need…" — that casts the author as a vendor and
   the reader as a customer. No second-person marketing, no feature superlatives.
3. **Terms of art stated plainly** — "P99 retained cost", "rate-on-line", "premium-to-surplus".
   No hedging, no exclamation.
4. **Length caps.** Card copy ≤ 40 words; tool-header `<p>` ≤ 50 words. The browser-privacy line
   lives in the footer, not in every header.
5. **One description per page**, used for both `meta name="description"` and `og:description`.

### Model honesty
Every instrument states its simplifications in a collapsible methodology block, and each one names
what was **excluded** and left to diligence rather than staying quiet about it. Demo data is
calibrated so tools can return an unfavorable answer — the Captive model's "small program" preset
returns Marginal, and the Risk Financing Optimizer will recommend full transfer or report that no
structure clears tolerance. A tool that always says yes is a brochure, not an instrument.

## Tools

### Decision instruments
- **Captive Feasibility Model** (`/risk-analytics/captive-feasibility/`) — Does a captive earn its
  frictional cost? Five-year deterministic pro forma: funded premium trending at loss cost, losses
  paid on a short/medium/long-tail pattern, fronting fee, premium tax, opex, formation cost, and
  investment income on average invested assets. Economic comparison counts the parent's real cost
  (losses + frictional + formation + opportunity cost of posted capital − investment income) against
  trended commercial premium; premium into a wholly owned captive nets out as an intercompany
  transfer. Three-state verdict (Feasible / Marginal / Not feasible) requiring >10% margin, P:S
  ≤ 3:1, and survival of a +20pt adverse loss ratio. Binary-search solve for minimum viable premium.
  Implied-carrier-loss-ratio readout guards against rigging the comparison basis. Presets: mid-market,
  healthcare PL, small program. Print/PDF.
- **Captive Operations & Governance** (`/risk-analytics/captive-operations/`) — Is the operating
  year under control, and what breaks first when something slips. The annual obligation calendar
  modeled as a dependency graph: each obligation has an anchor (fiscal year end or renewal), an
  offset, a lead time, and predecessors; the schedule resolves in dependency order so nothing starts
  before its inputs finish. Hard deadlines pull statutory dates from a domicile table (Vermont /
  Cayman / generic) — switching domicile genuinely moves which part of the year binds. Slack is
  computed empirically per obligation (delay a day at a time until a *new* breach appears), and the
  **binding chain** is the set sharing the minimum slack — not zero-float, since almost nothing on a
  real calendar has literally zero. Slip-cascade simulator propagates a delay and reports what moves,
  by how much, and what breaches. Service provider concentration table surfaces single points of
  failure. Gantt with an as-of marker via a custom Chart.js plugin. Governance memo. Print/PDF.
  Guards a circular dependency without hanging.
- **Risk Financing Optimizer** (`/risk-analytics/risk-financing-optimizer/`) — How much risk to
  retain and in which structure. 10,000-trial Monte Carlo (seeded mulberry32, Poisson frequency,
  lognormal severity) across a fixed retention grid, pricing guaranteed cost vs. SIR vs.
  captive-funded. Capital is charged against **TVaR** (average of the tail beyond the percentile),
  not the percentile itself — this is what makes the cost frontier turn up rather than flatten.
  Tolerance percentile acts as a hard constraint; ties within 0.5% resolve to the lower retention.
  Captive only wins if it beats SIR by more than half its opex. Presets: manufacturer, health
  system, tech.
- **Legal Operating Model** (`/legal-ops/legal-operating-model/`) — What legal should cost and what
  belongs inside. Per-matter-type demand priced against a fully loaded in-house effective rate
  (loaded cost ÷ productive hours × overhead). Insourcing requires passing **both** a rate test and
  a scale test (≥0.5 FTE); work that passes on rate but fails on volume is flagged **sub-scale**
  rather than silently insourced. Panel consolidation applies a tiered discount to retained spend.
  Savings decompose into insourcing → consolidation via a Chart.js floating-bar waterfall. Base /
  efficiency / growth scenarios. Generates an operating-model memo. Print/PDF.
- **Board Risk Report** (`/risk-analytics/board-risk-report/`) — Which risks sit outside appetite.
  Register with likelihood, modeled exposure, velocity, trend, mitigation, owner function, prior
  score. Impact band derived from editable dollar breakpoints so the 1–5 scale stays anchored to
  money. Residual = inherent × mitigation factor. Distinguishes **single-risk breach** from
  **accumulation breach** — different findings requiring different responses. Flags stance-versus-
  position tension (averse categories running ≥80% of tolerance). 5×5 CSS heat map, likelihood ×
  impact bubble chart, per-category tolerance bars, rule-generated board narrative. Print/PDF.
- **Litigation Decision Tree** (`/legal-ops/litigation-decision-tree/`) — Settlement offer against
  the distribution behind it. Probability tree, expected value, outcome distribution, probability of
  doing worse than settlement, tornado sensitivity, settle/fight verdict.
- **M&A Risk Scorecard** (`/risk-analytics/ma-risk-scorecard/`) — Weighted risk across six diligence
  dimensions → escrow, indemnity cap, survival, R&W insurance positions, board memo.
- **MPL Underwriting & Float Simulator** (`/risk-analytics/mpl-simulator/`) — 10-year monthly
  simulation of premium, loss emergence, float, and investment income. Scenario A/B pinning,
  shareable URL-hash state.

### Analytics toolkit
- **Loss Run Analyzer** (`/risk-analytics/loss-run-analyzer/`) — frequency, severity, development, exposure by policy period.
- **IBNR Reserve Estimator** (`/risk-analytics/ibnr-estimator/`) — chain-ladder and Bornhuetter-Ferguson from a triangle.
- **TCOR Dashboard** (`/risk-analytics/tcor-dashboard/`) — total cost of risk normalized per $1,000 revenue vs. benchmark.
- **Insurance Tower** (`/risk-analytics/insurance-tower/`) — layered structure, rate-on-line by layer, gap/overlap detection.
- **Combined Ratio** (`/risk-analytics/combined-ratio/`) — loss/expense/combined ratios by line and accident year.
- **Matter Economics** (`/legal-ops/matter-profitability/`) — realization, collection, effective rate, margin by matter. (Folder name retained; presented as "Matter Economics" and framed as the outside-counsel-economics lens rather than a firm-side tool.)
- **Contract Pipeline** (`/legal-ops/clm-pipeline/`) — cycle time by stage, bottleneck, throughput, 90-day renewal watchlist.

### Notes
`/notes/` index plus five articles, each paired with an instrument and cross-linked both ways:
`when-a-captive-makes-sense`, `retention-is-a-capital-decision`, `what-a-legal-department-should-cost`,
`settle-beyond-expected-value`, `risk-appetite-with-numbers`.

Article template: unified nav → `.tool-header` with `.article__meta` → `.article__body` (max-width
660px) → `.article__related` instrument card → footer. `Article` JSON-LD. No Chart.js.
First-person point of view is fine; **zero biographical anchors** ("at my company", "in my years at…").

### Fun (footer-linked only)
- **Monty Hall** (`/games/monty-hall/`), **Falling Sand** (`/games/falling-sand/`) — kept for
  personality, reachable only from the footer. Not part of the professional narrative.

### Retired
Retired tools become ~20-line stub pages with `<meta http-equiv="refresh">`, `robots noindex`, and a
canonical pointing at the destination — GitHub Pages has no server redirects. Remove from sitemap
and all listings.
- `/financial-modeling/options-calculator/` → `/` (retail-trading framing, off-positioning)
- `/risk-analytics/executive-summary/` → `/risk-analytics/tcor-dashboard/` (thin, overlapped TCOR)

## File Structure
```
/
├── index.html                                  (landing: hero, approach, instruments, notes, toolkit)
├── assets/css/shared.css                       (design system + site components)
├── assets/og/og-card.png                       (1200×630 social card, generated with PIL)
├── notes/                                      (index + 5 articles)
├── risk-analytics/
│   ├── captive-feasibility/  captive-operations/  risk-financing-optimizer/
│   ├── board-risk-report/
│   ├── ma-risk-scorecard/  mpl-simulator/
│   ├── loss-run-analyzer/  ibnr-estimator/  tcor-dashboard/
│   ├── insurance-tower/  combined-ratio/
│   └── executive-summary/                      (retired stub)
├── legal-ops/
│   ├── legal-operating-model/  litigation-decision-tree/
│   └── matter-profitability/  clm-pipeline/
├── financial-modeling/options-calculator/      (retired stub)
├── games/monty-hall/  games/falling-sand/
├── .claude/launch.json                         (local static server, port 8123)
├── favicon.svg  404.html  sitemap.xml  robots.txt
└── CLAUDE.md  README.md
```

## Design System
- **Font**: Inter (Google Fonts). **Colors**: neutral palette; category accents Risk=red, Legal=blue,
  Finance=green (unused since retirement, token retained), Fun=purple.
- **Shared components** in shared.css: `.site-nav`, `.site-footer`, `.card`, `.category-badge`,
  `.section-head`, `.instrument-card` + `.instrument-grid`, `.toolkit-row` + `.toolkit-list`,
  `.note-row` + `.notes-list`, `.article__*`, `.tool-note-link`, `.btn`, `.form-group`.
- **Per-tool components** (repeated locally in each tool's `<style>`, not shared): `.verdict`,
  `.kpi-strip`, `.chart-card`, `.methodology`, `.preset-btn`, `.grid-editor`.
- **Responsive**: breakpoints at 480px, 768px, 1024px.
- **Charts**: Chart.js v3.9.1, `animation: false` on live-updating tools so slider drags feel instant.

## Page conventions
- **Nav** — landing: `Instruments · Notes · Toolkit · LinkedIn`. Every other page: `Home · Notes · LinkedIn`.
- **Footer** — identical block on every page, including the games link and the privacy line.
- **Head template** — title, one description (reused for og), absolute canonical, `og:title/description/type/url/image`,
  `twitter:card = summary_large_image` + `twitter:image`. JSON-LD: `Person` on landing, `Article` on notes.
- **Header markup** — `<section class="tool-header">` with `<h1>` and one `<p>`. Do not reintroduce
  the `.hero tool-header` variant; it was normalized away.

## Technical Decisions
- Vanilla HTML/CSS/JS — no build process, deploys directly to GitHub Pages.
- Single-file tools (HTML with embedded CSS/JS); only shared.css and the og card are shared assets.
- All tools run client-side. No data leaves the browser, no persistence, no analytics.
- Seeded RNG (mulberry32) anywhere simulation is used, so identical inputs always return identical figures.
- Demo data should read current within about a year. Refresh the year ranges when they drift.

## Development
- **Local preview**: `.claude/launch.json` defines a `static-site` server on port 8123. Use it —
  `file://` hides URL fragments and distorts testing.
- **Verification**: drive tools through the browser console and assert conservation properties
  (payout fractions sum to 1, surplus reconciles to capital + cumulative UW + investment income,
  savings waterfalls reconcile to their total). Check boundary behavior on every verdict.
- **Deployment**: git push to main (auto-deploys to GitHub Pages).
- **Adding a tool**: create the folder under its category, follow the head template, nav, and footer
  conventions, write copy against the voice rules, add a card to the landing page and an entry to
  sitemap.xml, then document it here.
