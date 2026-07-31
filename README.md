# nealpathak.github.io

Decision instruments for the point where legal exposure meets capital allocation.

**Live site**: [nealpathak.github.io](https://nealpathak.github.io)

Most organizations run risk and legal as separate cost centers with separate ledgers. The decisions
that carry real money live at the seam between them — how much risk to retain, when a case is worth
settling, whether a captive earns its frictional cost, what a legal department should cost to run.
These are working models for answering those questions with numbers.

## Decision instruments

Models that end in a recommendation, not just a chart.

| Instrument | The decision |
|---|---|
| [Captive Feasibility Model](https://nealpathak.github.io/risk-analytics/captive-feasibility/) | Does a captive earn its frictional cost, or is the commercial market cheaper than it looks? |
| [Risk Financing Optimizer](https://nealpathak.github.io/risk-analytics/risk-financing-optimizer/) | How much risk should be retained, and through which structure? |
| [Legal Operating Model](https://nealpathak.github.io/legal-ops/legal-operating-model/) | What should the legal function cost, and which work belongs inside? |
| [Board Risk Report](https://nealpathak.github.io/risk-analytics/board-risk-report/) | Which enterprise risks sit outside stated appetite? |
| [Litigation Decision Tree](https://nealpathak.github.io/legal-ops/litigation-decision-tree/) | Is this settlement offer better than the distribution behind it? |
| [M&A Risk Scorecard](https://nealpathak.github.io/risk-analytics/ma-risk-scorecard/) | What is being acquired, and how much protection should the deal carry? |
| [MPL Underwriting & Float Simulator](https://nealpathak.github.io/risk-analytics/mpl-simulator/) | On a long-tail book, does investment income cover what underwriting gives away? |

## Notes

Short pieces on the frameworks behind the instruments — [notes index](https://nealpathak.github.io/notes/).

## Analytics toolkit

Supporting analysis: loss run analysis, IBNR reserving, total cost of risk, insurance tower
structure, combined ratio, matter economics, and contract pipeline cycle time.

## Tech

- Vanilla HTML/CSS/JS — no build process, deploys straight to GitHub Pages
- Single-file tools (each page is self-contained HTML with embedded CSS/JS)
- Shared design system in `assets/css/shared.css`
- Chart.js v3.9.1 for data visualization
- Seeded RNG where simulation is used, so identical inputs return identical figures
- Everything runs client-side — no data leaves the browser, and nothing is stored

Each instrument documents its own simplifications and states what it deliberately excludes. They are
screening and framing tools, not substitutes for an actuary, a broker, or counsel.
