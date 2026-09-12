# The captive renewal, AI-native

One workflow, start to finish, on the synthetic book already in this
repository: a single-parent captive writing workers' compensation, general
liability and auto liability for five operating companies, $250k retention,
an aggregate stop-loss, policies incepting 1 September, about $15m of
premium. The page walks the renewal twice, once as it is usually run and once
as a pipeline with people at named gates, with a clock and a cost meter
running on both, and ends with the comparison.

Everything below is a proposal for reaction. Numbers marked *default* are
editable inputs on the page, not claims.

## The headline the page is built to earn

| | Today (default assumptions) | AI-native | Change |
|---|---|---|---|
| Elapsed, data call to bound policy | about 16 weeks | about 5 to 6 weeks | floored by markets and the board calendar |
| Hours of people's time, in-house and opco | about 250 | about 35 | roughly 85% less |
| Cost per cycle, time plus external fees | about $62k | about $16k | roughly 75% less |

What does not change: the broker's commission, fronting and premium taxes,
the statutory actuarial opinion, how long reinsurers take to quote, and when
the board meets. The page says so in its own section. The one-off cost of
building the pipeline is also not in the per-cycle number; the same pipeline
runs the monthly reporting the rest of the year, which is the real return.

## The seven steps

Rates are loaded, blended defaults: risk manager $150/h, analyst $75/h, opco
finance $90/h, opco CFO $200/h, captive manager $250/h, consulting actuary
$350/h or fixed fee, outside counsel $500/h. Elapsed is business days.

### 1. Data call

**Today.** Request the loss run from the administrator as of the evaluation
date. Request payroll by state and class, revenue, and vehicle schedules from
five operating companies. Chase the ones that do not reply. Analyst 20h,
risk manager 8h, opco finance 5 × 6h. *15 days, $5,400.*

**AI-native.** The administrator's file already lands daily in the pipeline,
so there is no request. An agent sends each operating company a structured
request, reads what comes back (a spreadsheet, a PDF, a reply typed into the
email), builds the exposure schedule, reconciles it to last year and to the
payroll register, and lists every move over ten per cent with the evidence.
Gate: the risk manager clears the exceptions. Risk manager 2h, opco finance
5 × 1.5h. *3 days, waiting on replies; $975.*

Language model used: yes, to read the five replies, each deliberately in a
different shape. Recorded run shown on the page.

### 2. Loss run standardised, validated, reconciled

**Today.** Open the file, fix the dates, delete the duplicates, resolve the
three spellings of each company, paste into the workbook, notice some of the
errors. Analyst 30h, risk manager 4h. *5 days, $2,850.*

**AI-native.** The existing pipeline: parse, standardise, validate against
rules that grew out of real defects, reconcile to the prior run, quarantine
what cannot be loaded. Gate: a named person clears the quarantine before
release. Risk manager 1h. *Half a day, $150.*

Language model used: no. This is deterministic and should be.

### 3. Loss projection, aggregate erosion, capital

**Today.** Package the data for the consulting actuary. Wait. Answer their
questions. Receive the report: ultimates by year and line, expected losses
for the coming year, funding recommendation. Analyst 8h, risk manager 6h,
actuary fixed fee $30,000. *20 days, $31,500.*

**AI-native.** The loss development and capital engines run the moment the
release gate clears: chain-ladder and Bornhuetter–Ferguson ultimates, each
year's projected use of its aggregate, next year's expected loss, the
probability of breaching the capital requirement, and the capital that holds
it under tolerance. The actuary is engaged to review and opine on a fixed,
smaller scope rather than to build; the year-end statutory opinion is
unchanged and outside this workflow. Risk manager 4h, actuary review fee
$10,000. *5 days, actuary turnaround; $10,600.*

Language model used: no for the numbers. Yes, optionally, to draft the
methods note the actuary reviews.

### 4. Premium allocation to the operating companies

**Today.** Build the allocation, write the memo, hold five meetings with five
CFOs who each believe they are subsidising the others, rework it. Risk
manager 36h, opco CFOs 5 × 2h. *10 days, $7,400.*

**AI-native.** The allocation engine produces each company's premium with
the credibility weight and the cap as visible inputs. A model drafts each
company a one-page memo: its number, what moved it, and its own loss record
against exposure share. All five go out the same morning with a comment
window. Gate: the risk manager approves the allocation; disputes go to one
call. Risk manager 4h, opco CFOs 5 × 0.5h. *5 days, the comment window;
$1,100.*

Language model used: yes, the five memos. Recorded run shown.

### 5. Reinsurance and fronting submission, quotes, comparison

**Today.** Write the narrative, build the exhibits, the broker assembles and
markets it. Wait for quotes. Compare them in a spreadsheet; ask the actuary
what the attachment point is worth. Risk manager 24h, analyst 12h, actuary
4h. *30 days, $5,900 plus unchanged commission.*

**AI-native.** The submission pack assembles itself from the pipeline
exports and the engine outputs; a model drafts the narrative from the
numbers and the risk manager edits it. When quotes arrive, the capital model
prices each one as a change in breach probability, and a model writes the
comparison in words the board will read. Risk manager 6h. *Market floor,
about 20 days; $900.*

Language model used: yes, the narrative and the quote comparison. Recorded
runs shown. The market's quote window is the one thing this step cannot
compress; a clean early submission typically shortens it, which is the only
claim made.

### 6. Board pack and approval

**Today.** Assemble the pack from everyone's spreadsheets a week before the
meeting. Risk manager 16h, analyst 8h, captive manager 6h. *10 days,
$4,500.*

**AI-native.** The existing brief, generated from the same engines, with
the decisions requested at the top and the basis of preparation at the
bottom. Gate: the board. Risk manager 2h, captive manager 1h. *Pack ready
in a day; the meeting date is fixed; $550.*

Language model used: no.

### 7. Bind, issue, file, certificate

**Today.** Policy documents from the captive manager, wording changes to
counsel, domicile filing, certificates to every counterparty whose contract
requires one. Risk manager 6h, analyst 10h, captive manager 6h, counsel 3h.
*10 days, $4,650.*

**AI-native.** Policy documents generated from the bound terms; a model
diffs the wording against last year and lists the changes for counsel to
read in an hour; certificates generated from the contract register with the
gaps flagged (the existing contract requirements engine); filing drafted.
Risk manager 2h, captive manager 2h, counsel 1h. *3 days, $1,300.*

Language model used: yes, the wording diff. Recorded run shown.

## Where the model is, and where it is not

Five uses, each with the prompt, the output and the human gate after it
visible on the page: reading exposure replies, the allocation memos, the
submission narrative, the quote comparison, the wording diff. Everything
else is deterministic code with a self-test, and the page says which is
which. Most of the savings come from the pipeline and the engines, not the
model. Saying that plainly is what keeps an actuary or an auditor reading.

Because the site is static with no backend and no key, the model runs are
recorded: the real prompt and the real output committed to the repository,
reproducible and free. A bring-your-own-key mode can come later.

## The page

One page. The scroll is the renewal calendar.

1. **The number.** The comparison table above, live from the assumptions.
2. **The timeline.** Two tracks, today and AI-native, seven steps, the clock
   and the cost meter advancing as the reader scrolls.
3. **Each step, expandable.** Who does what, the artifact produced live from
   the demo book (the exception list, the erosion chart, the allocation, the
   quote comparison, the brief), the gate, the recorded model run where
   there is one.
4. **Assumptions.** Every rate, hour and fee in an editable table; the
   headline recomputes. The reader's own numbers, not mine.
5. **What this does not change.** Commission, fronting, taxes, the statutory
   opinion, market timing, the board calendar, and the one-off cost of
   building it.
6. **About and contact.** Short.

## What is kept and what is scrapped

Kept: `data/book.mjs`, `lib/`, the pipeline, loss development, capital and
allocation engines and their tests, the contract requirements engine for
certificates, most of `brief.mjs`, the stylesheet.

Added, small: five messy exposure replies, three reinsurance quotes, last
year's policy wording, a board date, and the five recorded model runs.

Scrapped: all sixteen current pages, the agent control plane, the matter
portfolio, the workflows page, the notes, the glossary. Git keeps them.

## Open questions

- Evaluation date for the renewal data: 31 May for a 1 September
  inception is typical. The book evaluates at 31 August; the renewal
  page would run at 31 May 2026 for policy year 2026.
- Whether the actuary's reduced review fee is $10k or left at the reader's
  discretion in the table. I would default it and let them change it.
- Whether step 5 shows one quote or three. Three makes the capital-model
  comparison worth reading.
