# Neal Pathak — Personal Site

## Overview
Personal site showcasing risk, finance, and legal-ops tools.
**Repository**: nealpathak.github.io
**Hosting**: GitHub Pages
**Tech Stack**: Vanilla HTML/CSS/JS, Chart.js v3.9.1
**Design**: Minimal, clean, Apple/Stripe-inspired. Inter font, system design tokens in shared.css.

## Site Goals
- Professional presence when someone Googles "Neal Pathak"
- Position toward director/C-suite trajectory in legal ops, risk, insurance
- Completely anonymous besides full name — no personal details, no email, no case studies

## Categories & Tools

### Risk (`/risk-analytics/`)
- **Loss Run Analyzer** — Parse insurance loss run CSV data, visualize claim frequency, severity distributions, development triangles, exposure by period. Drag-and-drop CSV upload. Policy erosion analysis with user-entered aggregate limits. Demo data included.
- **IBNR Reserve Estimator** — Estimate Incurred But Not Reported reserves from loss development triangles. Chain-Ladder and Bornhuetter-Ferguson methods. CSV upload of cumulative incurred by policy year and development period. Demo data included.
- **Executive Risk Summary** — Generate a printable executive risk summary with total cost of risk, loss ratios by line, and year-over-year comparisons. Form input, CSV upload with downloadable template, or demo data. Print/Save as PDF.
- **TCOR Dashboard** — Track total cost of risk across premium, retained losses, broker fees, loss control, and claims admin over multiple years. Normalized per $1,000 of revenue with peer benchmark comparison. Form-grid input (components × years), CSV upload, or demo data. Stacked bar, trend line, and composition donut charts plus detail table. Print/Save as PDF.
- **Insurance Tower Visualizer** — Render a layered insurance program as a vertical tower (primary through excess). Custom SVG tower with per-layer carrier, attachment, limit, premium, and rate-on-line labels; gap and overlap detection; program-level metrics (total limit, total premium, blended ROL, program top). Form editor (add/remove layers), CSV upload with template, or demo data. Premium-by-layer and ROL-by-layer companion charts. Print/Save as PDF.
- **M&A Risk Scorecard** — Pre-acquisition risk profile across six dimensions (financial, legal & regulatory, operational, insurance, ESG & compliance, integration), each with 4–5 weighted factors scored 1–5. Computes weighted overall score with rating bands (Low / Moderate / Elevated / High / Critical), Chart.js radar of dimension scores, dimension bars, top-5 risks ranked by contribution, deal-protection recommendations (escrow, indemnity cap, survival, R&W insurance, valuation impact range), reps-and-warranties to push for, DD priorities, and a printable board memo. Demo data (mid-market manufacturing target) included.
- **Combined Ratio & Underwriting Dashboard** — Carrier-side dashboard. One row per accident year × line of business with premium written, premium earned, losses incurred, and expenses incurred. Computes loss ratio, expense ratio, combined ratio, and underwriting result by year and by line. Multi-line trend chart with break-even (100%) and user-entered target CR overlays, stacked loss-vs-expense bars by line, current-year premium-mix donut, and a YoY summary table. Form/CSV/demo input modes; print/save as PDF.
- **MPL Underwriting & Float Simulator** — Live 10-year monthly simulation of a medical professional liability book. Sliders for written premium, loss ratio, expense ratio, portfolio/cash yields, deployment lag, payout tail length (5–15 yr, stretching an industry-shaped MPL development curve), and an optional month-30 large-loss event; claims-made/occurrence tail presets. Engine: uniform monthly policy inception with full premium collected up front, pro rata earning, incurred losses convolved with monthly payout fractions, cash-vs-portfolio investable asset walk (portfolio pays claims first), float = unearned premium + reserves. Outputs: KPI strip, float composition stacked area, cumulative investment income line, payout pattern bars, annual income component bars, and an annual summary table. Pin-as-Scenario-A/B comparison (in-memory) overlays charts and adds a 10-year totals delta table. Neutral, non-persuasive copy throughout; collapsible methodology notes. No print mode — it's a live dashboard, not a report generator.

### Finance (`/financial-modeling/`)
- **Options P&L Calculator** — Model single and multi-leg options strategies. Payoff diagrams, breakevens, max risk/reward. Preset strategies: long call, long put, covered call, bull/bear spreads, iron condor, straddle, strangle.

### Legal (`/legal-ops/`)
- **Litigation Decision Tree** — Model settle-vs-fight decisions as a probability-weighted tree. Interactive editor for branches (probability, cost, label) plus CSV upload with pre-order `depth,label,probability,cost` encoding. Computes expected value, best/worst case, standard deviation, probability of an outcome worse than settlement, and tornado sensitivity analysis (±10pp probability shift per branch with sibling renormalization). SVG tree rendering, outcome distribution chart, paths detail table, and a settle/fight recommendation against a user-entered offer. Print/Save as PDF.
- **Matter Profitability Dashboard** — Law firm matter economics. Per-matter inputs: hours worked, hours billed, billed $, collected $, cost. Computes realization rate, collection rate, effective hourly rate, margin %, write-off $, and a health pill (Strong/Healthy/Thin/Bleeding). Horizontal bar of top matters by margin contribution, practice-area donut by collected $, bubble scatter of effective rate vs margin sized by collected $, plus partner leaderboard and a negative-margin watchlist. Form editor (add/remove rows), CSV upload with template, or demo data (12 matters across 6 partners). Print/Save as PDF.
- **Contract Lifecycle Pipeline** — CLM pipeline view for corporate legal ops. Per-contract inputs: ID, counterparty, type, stage (Intake → Review → Negotiation → Signature → Executed → Expired), owner, intake/signed/expiry dates, annual value. Computes cycle time per contract (signed − intake for executed; as-of − intake for active), KPI bar (active pipeline, avg/median cycle, over-target count, expiring-in-90d count + at-risk $), funnel with bottleneck stage flagged, monthly-throughput bars, average-days-by-stage bars, contract-type donut, 90-day renewal watchlist with urgency pills, and an active-pipeline aging table. Form/CSV/demo input modes; print/save as PDF.

### Fun (`/games/`)
- **Monty Hall** — Play the classic probability puzzle. Pick a door, host reveals an empty one, choose switch or stay. Tracks running win rates split by strategy plus 100-round simulators for switch and stay so users can watch the percentages converge to the theoretical 2/3 vs 1/3.
- **Falling Sand** — Cellular-automata sandbox on a 200×125 grid rendered to canvas. Seven materials: sand (powder), water and oil (liquids with lateral spread), wood and stone (static solids), fire (consumes wood slowly and oil fast, extinguished by water, lifts when unfuelled), smoke (rises and decays). Density-based displacement gives emergent behavior — sand sinks through water, oil floats, fire dies into smoke. Fixed 60 Hz simulation timestep decoupled from display refresh. Brush-size slider, keyboard shortcuts (1–7 materials, [ ] brush, Space pause), stroke-interpolated pointer painting (mouse + touch), preset scene, and live particle/FPS stats. No dependencies — pure canvas, no Chart.js.

## File Structure
```
/
├── index.html                              (landing page)
├── assets/css/shared.css                   (design system)
├── risk-analytics/loss-run-analyzer/       (Loss Run Analyzer)
├── risk-analytics/ibnr-estimator/          (IBNR Reserve Estimator)
├── risk-analytics/executive-summary/       (Executive Risk Summary)
├── risk-analytics/tcor-dashboard/          (TCOR Dashboard)
├── risk-analytics/insurance-tower/         (Insurance Tower Visualizer)
├── risk-analytics/ma-risk-scorecard/       (M&A Risk Scorecard)
├── risk-analytics/combined-ratio/          (Combined Ratio & Underwriting Dashboard)
├── risk-analytics/mpl-simulator/           (MPL Underwriting & Float Simulator)
├── financial-modeling/options-calculator/   (Options P&L Calculator)
├── legal-ops/litigation-decision-tree/      (Litigation Decision Tree)
├── legal-ops/matter-profitability/         (Matter Profitability Dashboard)
├── legal-ops/clm-pipeline/                 (Contract Lifecycle Pipeline)
├── games/monty-hall/                        (Monty Hall game)
├── games/falling-sand/                      (Falling Sand sandbox)
├── favicon.svg
├── 404.html
├── sitemap.xml
├── robots.txt
├── CLAUDE.md
└── README.md
```

## Design System
- **Font**: Inter (Google Fonts)
- **Colors**: Neutral palette, category accent colors (Risk=red, Finance=green, Legal=blue, Fun=purple)
- **CSS Variables**: Comprehensive design tokens in shared.css
- **Responsive**: Breakpoints at 480px, 768px, 1024px
- **Charts**: Chart.js v3.9.1 with consistent styling across tools

## Technical Decisions
- Vanilla HTML/CSS/JS — no build process, deploys directly to GitHub Pages
- Single-file tools (HTML with embedded CSS/JS) for simplicity
- Shared design system via shared.css for consistency
- Chart.js v3.9.1 for all data visualization
- Each tool folder has its own index.html for clean URLs
- All tools run client-side only — no data leaves the browser

## Development
- **Testing**: Open any index.html in browser
- **Deployment**: Git push to main (auto-deploys to GitHub Pages)
- **Adding a new tool**: Create folder under category, add index.html, link from landing page
