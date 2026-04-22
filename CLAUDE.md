# Neal Pathak — Personal Site

## Overview
Personal site showcasing risk analytics, financial modeling, data intelligence, and simulation tools.
**Repository**: nealpathak.github.io
**Hosting**: GitHub Pages
**Tech Stack**: Vanilla HTML/CSS/JS, Chart.js v3.9.1
**Design**: Minimal, clean, Apple/Stripe-inspired. Inter font, system design tokens in shared.css.

## Site Goals
- Professional presence when someone Googles "Neal Pathak"
- Position toward director/C-suite trajectory in legal ops, risk, insurance
- Signal consulting availability for tools, automated workflows, systems
- Each tool has a mini case study explaining the "why" before the tool itself

## Categories & Tools

### Risk Analytics (`/risk-analytics/`)
- **Loss Run Analyzer** — Parse insurance loss run CSV data, visualize claim frequency, severity distributions, development triangles, exposure by period. Demo data included.

### Financial Modeling (`/financial-modeling/`)
- **Options P&L Calculator** — Model single and multi-leg options strategies. Payoff diagrams, breakevens, max risk/reward. Preset strategies: long call, covered call, spreads, iron condor, straddle, strangle.

### Data Intelligence (`/data-intelligence/`)
- **Volatility Surface Explorer** — Interactive 3D implied volatility surface with adjustable parameters (base IV, skew, term slope, smile curvature). Regime presets (normal, fear, complacent, crash). 2D slice charts for smile and term structure.

### Simulations (`/simulations/`)
- **Market Maker** — Trading simulation. Set bid-ask spreads, manage inventory risk, profit from spread while navigating informed vs noise traders. Three difficulty levels, 50-round sessions.

## File Structure
```
/
├── index.html                              (landing page)
├── assets/css/shared.css                   (design system)
├── risk-analytics/loss-run-analyzer/       (Loss Run Analyzer)
├── financial-modeling/options-calculator/   (Options P&L Calculator)
├── data-intelligence/volatility-surface/   (Volatility Surface Explorer)
├── simulations/market-maker/               (Market Maker game)
├── Neal_Pathak_Resume.pdf
├── CLAUDE.md
└── README.md
```

## Design System
- **Font**: Inter (Google Fonts)
- **Colors**: Neutral palette, category accent colors (Risk=red, Finance=blue, Data=green, Sim=purple)
- **CSS Variables**: Comprehensive design tokens in shared.css
- **Responsive**: Breakpoints at 480px, 768px, 1024px
- **Charts**: Chart.js v3.9.1 with consistent styling across tools

## Technical Decisions
- Vanilla HTML/CSS/JS — no build process, deploys directly to GitHub Pages
- Single-file tools (HTML with embedded CSS/JS) for simplicity
- Shared design system via shared.css for consistency
- Chart.js v3.9.1 for all data visualization
- Each tool folder has its own index.html for clean URLs

## Development
- **Testing**: Open any index.html in browser
- **Deployment**: Git push to main (auto-deploys to GitHub Pages)
- **Adding a new tool**: Create folder under category, add index.html, link from landing page

## Next Steps
- Mobile responsiveness testing and polish
- Consider adding more tools per category
- Potential additions: litigation cost estimator, contract portfolio tracker, Monte Carlo simulator
