# Neal Pathak — Personal Site

## Overview
Personal site showcasing risk analytics, financial modeling, and data intelligence tools.
**Repository**: nealpathak.github.io
**Hosting**: GitHub Pages
**Tech Stack**: Vanilla HTML/CSS/JS, Chart.js v3.9.1
**Design**: Minimal, clean, Apple/Stripe-inspired. Inter font, system design tokens in shared.css.

## Site Goals
- Professional presence when someone Googles "Neal Pathak"
- Position toward director/C-suite trajectory in legal ops, risk, insurance
- Completely anonymous besides full name — no personal details, no email, no case studies

## Categories & Tools

### Risk Analytics (`/risk-analytics/`)
- **Loss Run Analyzer** — Parse insurance loss run CSV data, visualize claim frequency, severity distributions, development triangles, exposure by period. Drag-and-drop CSV upload. Policy erosion analysis with user-entered aggregate limits. Demo data included.
- **IBNR Reserve Estimator** — Estimate Incurred But Not Reported reserves from loss development triangles. Chain-Ladder and Bornhuetter-Ferguson methods. CSV upload of cumulative incurred by policy year and development period. Demo data included.
- **Executive Risk Summary** — Generate a printable executive risk summary with total cost of risk, loss ratios by line, and year-over-year comparisons. Form input, CSV upload with downloadable template, or demo data. Print/Save as PDF.
- **TCOR Dashboard** — Track total cost of risk across premium, retained losses, broker fees, loss control, and claims admin over multiple years. Normalized per $1,000 of revenue with peer benchmark comparison. Form-grid input (components × years), CSV upload, or demo data. Stacked bar, trend line, and composition donut charts plus detail table. Print/Save as PDF.
- **Insurance Tower Visualizer** — Render a layered insurance program as a vertical tower (primary through excess). Custom SVG tower with per-layer carrier, attachment, limit, premium, and rate-on-line labels; gap and overlap detection; program-level metrics (total limit, total premium, blended ROL, program top). Form editor (add/remove layers), CSV upload with template, or demo data. Premium-by-layer and ROL-by-layer companion charts. Print/Save as PDF.

### Financial Modeling (`/financial-modeling/`)
- **Options P&L Calculator** — Model single and multi-leg options strategies. Payoff diagrams, breakevens, max risk/reward. Preset strategies: long call, long put, covered call, bull/bear spreads, iron condor, straddle, strangle.

### Legal Ops (`/legal-ops/`)
- **Litigation Decision Tree** — Model settle-vs-fight decisions as a probability-weighted tree. Interactive editor for branches (probability, cost, label) plus CSV upload with pre-order `depth,label,probability,cost` encoding. Computes expected value, best/worst case, standard deviation, probability of an outcome worse than settlement, and tornado sensitivity analysis (±10pp probability shift per branch with sibling renormalization). SVG tree rendering, outcome distribution chart, paths detail table, and a settle/fight recommendation against a user-entered offer. Print/Save as PDF.

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
├── financial-modeling/options-calculator/   (Options P&L Calculator)
├── legal-ops/litigation-decision-tree/      (Litigation Decision Tree)
├── Neal_Pathak_Resume.pdf
├── CLAUDE.md
└── README.md
```

## Design System
- **Font**: Inter (Google Fonts)
- **Colors**: Neutral palette, category accent colors (Risk=red, Finance=blue, Data=green)
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
