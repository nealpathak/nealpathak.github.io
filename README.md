# nealpathak.github.io

Working software for corporate risk and legal operations, published as a static
site at [nealpathak.github.io](https://nealpathak.github.io).

The bar for anything in this repository is deliberately narrow:

1. **The problem exists whether or not this exists.** No inventing a difficulty
   in order to sell the cure.
2. **Nothing on the market already answers it.** A better-looking version of
   something a category leader already sells is not worth building. If the
   answer is "a dashboard of KPIs", it does not go in.
3. **It computes something, rather than displaying something.** The output is a
   number that did not exist before it ran, together with the reasoning that
   produced it.
4. **It is arguable.** Assumptions are on the surface, the engine is tested, and
   the same inputs return the same answer.

---

## Exposure Ledger

`tools/exposure-ledger/`

Joins a contract register to a schedule of insurance and computes the
contractual liability the company retains on itself.

Contract lifecycle systems know what the clause says. Risk systems know what the
tower covers. Nothing joins them, so the only contractual figure most companies
can produce is the sum of their liability caps — which answers a question nobody
asked, and is silent on the classes that escape the cap entirely.

**What it does that a spreadsheet cannot:**

- Decomposes every contract into five peril classes and gives each the ceiling
  that *actually* applies — the cap, a carve-out supercap, or none. The cap in
  the register is not the ceiling on indemnity, IP, data or gross negligence,
  and that gap is where the money is.
- Routes each class to the policy line that answers for it, **or to no line**.
  IP infringement is excluded from the general liability form; gross negligence
  is uninsurable in most states. That exposure is retained by construction.
- Simulates the whole book together, with shared aggregates eroding inside every
  trial, so a claim on one contract reduces the limit standing behind all the
  others. This is the interaction that per-contract review cannot see.
- Attributes the tail. Contracts are ranked by average retained loss inside the
  worst one per cent of years, which produces a renegotiation queue ordered by
  what reopening each one is worth.
- Prices the levers side by side: buying a layer, versus rewriting a carve-out.

**Inputs** — two CSVs, read in the browser. Nothing is uploaded, nothing is
persisted, and there is no server behind the page. Closing the tab discards
everything.

| | |
|---|---|
| Contract register | `contract_id, counterparty, category, annual_value, cap_type, cap_value, cap_carveouts, renewal_date, owner` |
| Schedule of insurance | `line, layer, attachment, limit, aggregate_limit, aggregate_eroded, retention, agg_group, captive, premium` |

Carve-outs are written the way the clause reads:
`INDEMNITY=UNCAPPED;DATA=3x;IP=5000000`.

**Outputs** — retained exposure as a distribution, where each dollar of loss
lands, aggregate exhaustion probabilities, a ranked renegotiation queue, priced
levers, a board memo, and CSV exports.

### Running the engine's tests

```bash
node tools/exposure-ledger/selftest.mjs
```

59 checks covering clause and money parsing, layer allocation, aggregate
erosion, captive versus third-party recovery, reconciliation identities,
seed determinism, and the levers. A loss can never recover more than it cost and
an aggregate can never pay out more than it holds.

### Serving locally

```bash
python -m http.server 4174
```

The site is static with no build step. Modules are loaded natively, so it must
be served over HTTP rather than opened from the filesystem — and from a server
that preserves directory trailing slashes.

---

## On the assumptions

The default claim frequencies and severities in `assume.js` describe a generic
mid-to-large US corporate book. **They are a starting position for argument, not
a finding**, and they are labelled that way everywhere they surface. Any
organisation with three or more years of loss history should replace them using
the calibration panel, which fits frequency and severity per category from what
actually happened.

Every figure the sample book produces comes from 412 invented counterparties
generated from a fixed seed. No real contract, carrier, claim or loss appears
anywhere in this repository.

## Structure

```
index.html                     the argument, and the case for the tool
assets/css/site.css            shared shell
assets/css/tool.css            model chrome
assets/js/fmt.js               number, money and date formatting
tools/exposure-ledger/
  index.html                   the model's page
  app.js                       wiring and rendering
  assume.js                    the assumption set, isolated so it can be replaced
  data.js                      CSV, cap and carve-out parsing, validation
  sim.js                       seeded Monte Carlo, layer allocation, erosion
  findings.js                  distribution to actionable findings
  charts.js                    inline SVG, no libraries
  memo.js                      board memo and CSV exports
  samples.js                   the synthetic book
  selftest.mjs                 the engine's tests
```

## Next

- **Captive capacity model** — whether a captive can underwrite a new line, and
  what writing it does to surplus and the probability of impairment.
- **Certificate reconciliation** — the insurance a contract required, against
  the certificates and endorsements actually on file.

Built and maintained by Neal Pathak.
