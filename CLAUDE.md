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

### Financial Modeling (`/financial-modeling/`)
- **Options P&L Calculator** — Model single and multi-leg options strategies. Payoff diagrams, breakevens, max risk/reward. Preset strategies: long call, long put, covered call, bull/bear spreads, iron condor, straddle, strangle.

### Data Intelligence (`/data-intelligence/`)
- **Monte Carlo Simulator** — Simulate thousands of price paths using geometric Brownian motion. Visualize distribution of outcomes, percentile paths, probability of profit. Presets for S&P 500, growth stocks, crypto, bond funds.

## File Structure
```
/
├── index.html                              (landing page)
├── assets/css/shared.css                   (design system)
├── risk-analytics/loss-run-analyzer/       (Loss Run Analyzer)
├── financial-modeling/options-calculator/   (Options P&L Calculator)
├── data-intelligence/monte-carlo/          (Monte Carlo Simulator)
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
