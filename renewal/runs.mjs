// Recorded model runs. Each is one call to a language model made once and
// committed: the exact prompt, the exact output, and the figures the output
// cites. The site has no backend, so nothing here runs live. The test suite
// recomputes every cited figure from the engines and checks that the text
// still says it; if the book or an engine changes, the run fails until it is
// re-recorded.

import { EXPOSURE_REPLIES, ADJUSTER_NOTES, QUOTES, WORDING } from './data.mjs';

const SYSTEM = 'You are an analyst in the risk department of a company that owns a captive insurer. Answer only from the material given. Where the material is ambiguous or missing, say so rather than guess. Show every number you rely on.';

export const RUNS = [
  {
    id: 'exposure', step: 'data', title: 'Read five exposure replies into one schedule',
    model: 'Claude', recorded: '2026-06-04',
    gate: 'The risk manager clears the four exceptions before the schedule is used. On this book: Harbor Foods confirmed thousands; Crestview sent the fleet count the next day; Meridian\'s acquisition is excluded at inception and endorsed at closing; Summit\'s figures are trended at the group rate pending its budget.',
    prompt: () => `${SYSTEM}

Below are the replies from five operating companies to a request for the coming year's exposure: gross payroll, revenue, and the number of vehicles, for the policy year beginning 1 September 2026. Last year's schedule is also given. Produce (1) the exposure schedule for the coming year with one row per company, payroll and revenue in dollars, and (2) a list of exceptions: anything in a reply that is ambiguous, missing, inconsistent with last year by more than 10%, or that a careful person would want confirmed before using the number.

LAST YEAR'S SCHEDULE (2025-26)
Northline Logistics: payroll $57,160,000; revenue $285,800,000; vehicles 517
Harbor Foods: payroll $48,990,000; revenue $435,500,000; vehicles 163
Crestview Services: payroll $38,100,000; revenue $129,300,000; vehicles 286
Meridian Health Partners: payroll $74,850,000; revenue $245,000,000; vehicles 54
Summit Build Group: payroll $42,190,000; revenue $190,500,000; vehicles 218

REPLIES
${EXPOSURE_REPLIES.map(r => `--- From: ${r.from}\nSubject: ${r.subject}\n\n${r.body}`).join('\n\n')}`,
    output: `EXPOSURE SCHEDULE, POLICY YEAR 2026-27

| Company | Payroll | Revenue | Vehicles | Basis |
|---|---|---|---|---|
| Northline Logistics | $59,730,000 | $298,600,000 | 540 | CSV, summed across five states; revenue from the covering note |
| Harbor Foods | $51,200,000 | $455,100,000 | 171 | Email states figures are in $000s; converted. Excludes 14 trailers per the reply |
| Crestview Services | $39,820,000 | $135,100,000 | not supplied | Table in email; fleet count promised separately |
| Meridian Health Partners | $78,220,000 | $256,000,000 | 57 | Existing operations only; see exception 3 |
| Summit Build Group | $42,190,000 | $190,500,000 | 218 | Prior-year actuals, not a forecast; see exception 4 |

Year-on-year: Northline +4.5% payroll, +4.5% revenue, +4.4% vehicles. Harbor +4.5% / +4.5% / +4.9%. Crestview +4.5% / +4.5%. Meridian +4.5% / +4.5% / +5.6% on existing operations. Summit 0% on all three, because the figures are last year's.

EXCEPTIONS

1. Harbor Foods, units. The reply says "all figures in $000s". Payroll of 51,200 has been read as $51,200,000, which is 4.5% above last year and consistent with the others. Confirm with the sender; if the figures were in dollars the schedule would be wrong by a factor of a thousand.

2. Crestview Services, vehicles missing. The fleet count "will be sent separately". Auto liability exposure for Crestview cannot be set until it arrives. Last year's count was 286; trended at the group's 4.5% it would be about 299, but that is an estimate, not a reply.

3. Meridian Health Partners, acquisition. The export shows total payroll of $89,100,000, 19% above last year, of which $10,880,000 is Red River Clinics, an acquisition "effective 2026-12-01, pending close". The schedule above uses existing operations only ($78,220,000, +4.5%). Decide whether the acquisition is to be rated at inception or endorsed mid-term when it closes; either way the reinsurance and fronting terms on newly acquired operations need checking, since $10.9m is 14% of Meridian's payroll and about 4% of the group's.

4. Summit Build Group, wrong year. The reply gives last year's numbers ("Here are the numbers from last year") and says the FY27 budget is two weeks away. The schedule shows them unchanged and flagged. If a forecast is needed now, trending at the group's 4.5% gives payroll $44,090,000, revenue $199,100,000 and 228 vehicles; replace with the budget when it arrives.

Nothing else in the replies is inconsistent with last year by more than 10%.`,
    figures: [
      { key: 'exposure.NLL.payroll', text: '$59,730,000', value: 59730000, tol: 5000 },
      { key: 'exposure.HFD.payroll', text: '$51,200,000', value: 51200000, tol: 5000 },
      { key: 'exposure.CVS.payroll', text: '$39,820,000', value: 39820000, tol: 5000 },
      { key: 'exposure.MHP.payroll', text: '$78,220,000', value: 78220000, tol: 5000 },
      { key: 'exposure.SBG.payroll', text: '$44,090,000', value: 44090000, tol: 5000 },
      { key: 'exposure.NLL.revenue', text: '$298,600,000', value: 298600000, tol: 50000 },
      { key: 'exposure.SBG.revenue', text: '$199,100,000', value: 199100000, tol: 50000 },
      { key: 'exposure.NLL.vehicles', text: '540', value: 540, tol: 0.5 },
      { key: 'exposure.SBG.vehicles', text: '228', value: 228, tol: 0.5 },
    ],
  },

  {
    id: 'memos', step: 'allocation', title: 'Five allocation memos, one per operating company',
    model: 'Claude', recorded: '2026-07-16',
    gate: 'The risk manager approves the allocation before the memos go out. Each company gets five business days to comment; disputes go to one call with the numbers on the table.',
    prompt: () => `${SYSTEM}

The captive's premium for policy year 2026-27 is $15,425,000. It has been allocated to the five operating companies by the attached method: each company's share of exposure, adjusted by its own loss experience over policy years 2020-21 to 2024-25 to the extent that experience is credible (250 claims for half credibility), and capped so that no company moves more than 25% from its exposure-based share.

Write a one-page memo to the CFO of each company. State the company's allocated premium, its exposure-based premium, the difference, and what drove the difference by line. Explain the credibility weight in one sentence. Do not apologise, do not speculate about causes the data does not show, and do not compare a company to another by name.

ALLOCATION OUTPUT (from the engine)
Northline Logistics: exposure-based $4,234,486; allocated $4,323,617; change +$89,131 (+2.1%); claims in window 488.
  WC: relativity 0.91, credibility 38%, exposure-based $1,632,750, allocated $1,577,820.
  GL: relativity 1.42, credibility 30%, exposure-based $822,000, allocated $926,659.
  AL: relativity 1.07, credibility 48%, exposure-based $1,779,736, allocated $1,819,138.
Harbor Foods: exposure-based $3,214,093; allocated $3,189,423; change -$24,670 (-0.8%); claims 364.
  WC: relativity 1.16, credibility 36%, exposure-based $1,399,500, allocated $1,482,172.
  GL: relativity 0.78, credibility 36%, exposure-based $1,252,571, allocated $1,153,153.
  AL: relativity 0.98, credibility 24%, exposure-based $562,022, allocated $554,098.
Crestview Services: exposure-based $2,443,896; allocated $2,344,867; change -$99,029 (-4.1%); claims 259.
  WC: relativity 0.78, credibility 27%, exposure-based $1,088,500, allocated $1,023,252.
  GL: relativity 1.00, credibility 12%, exposure-based $371,857, allocated $372,707.
  AL: relativity 0.92, credibility 35%, exposure-based $983,538, allocated $948,908.
Meridian Health Partners: exposure-based $3,030,037; allocated $3,011,288; change -$18,749 (-0.6%); claims 276.
  WC: relativity 0.96, credibility 41%, exposure-based $2,138,125, allocated $2,100,750.
  GL: relativity 1.13, credibility 27%, exposure-based $704,571, allocated $729,361.
  AL: relativity 0.57, credibility 6%, exposure-based $187,341, allocated $181,176.
Summit Build Group: exposure-based $2,502,488; allocated $2,555,804; change +$53,317 (+2.1%); claims 278.
  WC: relativity 1.21, credibility 30%, exposure-based $1,205,125, allocated $1,280,005.
  GL: relativity 0.71, credibility 20%, exposure-based $548,000, allocated $517,120.
  AL: relativity 1.07, credibility 30%, exposure-based $749,363, allocated $758,679.
Loss ratios over the window, premium paid against developed losses: Northline 80%, Harbor 74%, Crestview 65%, Meridian 74%, Summit 79%.`,
    output: `MEMO — Northline Logistics
To: Chief Financial Officer. Re: Captive premium, policy year 2026-27.

Your allocated premium for 2026-27 is $4,323,617. On exposure alone it would have been $4,234,486. The difference is $89,131, or 2.1% more.

What drove it. General liability is the reason. Over the five years to 2024-25 your general liability losses ran at 1.42 times the group's rate per dollar of revenue, and that experience carries 30% weight, which adds $104,659 to the line. Workers' compensation moved the other way: your losses ran at 0.91 of the group's rate per dollar of payroll, at 38% weight, taking $54,930 off. Auto liability is close to the group rate and adds $39,402.

Credibility. Each line's adjustment is weighted by how much of your own record there is to go on: 488 claims across the three lines over five years, which is enough to move the number but not enough to set it alone.

Over the window your premium paid covered your developed losses at an 80% loss ratio, the highest of the five companies' but inside the level the captive is funded for.

The allocation is capped at 25% either side of exposure share; none of your lines reached the cap.

—

MEMO — Harbor Foods
To: Chief Financial Officer. Re: Captive premium, policy year 2026-27.

Your allocated premium for 2026-27 is $3,189,423, against $3,214,093 on exposure alone: $24,670 less, or 0.8%.

What drove it. Two lines nearly cancel. Workers' compensation ran at 1.16 times the group's rate per dollar of payroll, at 36% weight, adding $82,672. General liability ran at 0.78 of the group's rate per dollar of revenue, at 36% weight, taking $99,418 off. Auto liability is at the group rate and moves $7,924 down.

Credibility. 364 claims over five years; each line's adjustment is weighted accordingly, between 24% and 36%.

Your five-year loss ratio on premium paid is 74%.

—

MEMO — Crestview Services
To: Chief Financial Officer. Re: Captive premium, policy year 2026-27.

Your allocated premium for 2026-27 is $2,344,867, against $2,443,896 on exposure alone: $99,029 less, or 4.1%. This is the largest reduction of the five.

What drove it. Workers' compensation: your losses ran at 0.78 of the group's rate per dollar of payroll and that record carries 27% weight, taking $65,248 off the line. Auto liability ran at 0.92 of the group rate at 35% weight, taking $34,630 off. General liability is at the group rate and is unchanged within $850.

Credibility. 259 claims over five years. The general liability weight is only 12%, so that line stays at exposure share whatever its recent record.

Your five-year loss ratio on premium paid is 65%, the lowest of the five companies.

—

MEMO — Meridian Health Partners
To: Chief Financial Officer. Re: Captive premium, policy year 2026-27.

Your allocated premium for 2026-27 is $3,011,288, against $3,030,037 on exposure alone: $18,749 less, or 0.6%.

What drove it. Workers' compensation, your largest line, ran at 0.96 of the group's rate per dollar of payroll at 41% weight, taking $37,375 off. General liability ran at 1.13 of the group rate at 27% weight, adding $24,790. Auto liability is small for you (6% credibility on the record) and moves $6,165 down.

Credibility. 276 claims over five years, most of them workers' compensation, which is why that line carries the highest weight.

Your five-year loss ratio on premium paid is 74%.

Note for the coming year: the Red River Clinics acquisition, expected to close 1 December 2026, is not in this allocation. Its payroll will be rated by endorsement at closing.

—

MEMO — Summit Build Group
To: Chief Financial Officer. Re: Captive premium, policy year 2026-27.

Your allocated premium for 2026-27 is $2,555,804, against $2,502,488 on exposure alone: $53,317 more, or 2.1%.

What drove it. Workers' compensation: your losses ran at 1.21 times the group's rate per dollar of payroll, the highest relativity of any line in the group, at 30% weight, adding $74,880. General liability ran at 0.71 of the group rate at 20% weight, taking $30,880 off. Auto liability adds $9,316.

Credibility. 278 claims over five years; the workers' compensation weight of 30% is what limits the increase to $74,880 rather than the $247,000 the raw relativity would imply.

Your five-year loss ratio on premium paid is 79%.`,
    figures: [
      { key: 'alloc.NLL.allocated', text: '$4,323,617', value: 4323617, tol: 1 },
      { key: 'alloc.NLL.exposureBased', text: '$4,234,486', value: 4234486, tol: 1 },
      { key: 'alloc.HFD.allocated', text: '$3,189,423', value: 3189423, tol: 1 },
      { key: 'alloc.CVS.allocated', text: '$2,344,867', value: 2344867, tol: 1 },
      { key: 'alloc.MHP.allocated', text: '$3,011,288', value: 3011288, tol: 1 },
      { key: 'alloc.SBG.allocated', text: '$2,555,804', value: 2555804, tol: 1 },
      { key: 'alloc.SBG.change', text: '$53,317', value: 53317, tol: 1 },
      { key: 'alloc.CVS.change', text: '$99,029', value: -99029, tol: 1, abs: true },
      { key: 'alloc.total', text: '$15,425,000', value: 15425000, tol: 1, inPrompt: true },
      { key: 'subsidy.CVS.lossRatio', text: '65%', value: 0.648, tol: 0.006, pct: true },
    ],
  },

  {
    id: 'narratives', step: 'submission', title: 'Large-loss narratives for the submission',
    model: 'Claude', recorded: '2026-07-20',
    gate: 'The claims manager reads the five narratives against the files before they go into the submission. Nothing in them is new; every fact is in the adjuster\'s notes.',
    prompt: () => `${SYSTEM}

The reinsurance submission needs a narrative for each of the 21 open claims with incurred at or above the $250,000 retention. Below are the five largest; the other sixteen follow in the same format. Write one paragraph per claim for an underwriter: what happened, the medical or legal course, where it stands, what the reserve is for, and the risk of it developing. Plain English, no abbreviations, no claimant names. Use only the adjuster's notes.

CLAIMS (from the standardised loss run at 31 August 2026)
${ADJUSTER_NOTES.map(n => n.id).join(', ')}

ADJUSTER NOTES
${ADJUSTER_NOTES.map(n => `--- ${n.id}\n${n.notes}`).join('\n\n')}`,
    output: `WC-2025-02326 — Meridian Health Partners, Oklahoma, workers' compensation. Incurred $310,639 (paid $61,653, reserved $248,986).
A registered nurse with fourteen years' service slipped on a wet corridor floor in September 2025, striking her head and right shoulder. Imaging ruled out a bleed; the diagnosis was concussion and a rotator cuff tear. The tear was repaired arthroscopically in November 2025, re-tore, and was revised in April 2026. She returned to light duty at four hours a day in June 2026. An independent medical examination is scheduled for September 2026. The reserve covers the revision, therapy and a possible third procedure ($165,000) and temporary disability through estimated maximum improvement in January 2027 ($84,000). No attorney is involved and the claimant is cooperative; the adjuster rates litigation risk low. The main development risk is a third procedure.

WC-2024-01907 — Crestview Services, New Mexico, workers' compensation. Incurred $302,292 (paid $65,453, reserved $236,839).
A technician cut his left forearm on sheet metal in March 2025; the claim was reported 41 days later. The wound became infected and required four days of intravenous antibiotics, after which complex regional pain syndrome was diagnosed. A spinal cord stimulator was implanted in January 2026 and gives about 40% relief; he remains fully disabled from work. The reserve is $170,000 for ongoing pain management and eventual replacement of the stimulator, and $67,000 for disability benefits. An attorney's letter was received in May 2026 but no suit has been filed; compensability is not disputed. The adjuster recommends opening settlement discussions at maximum medical improvement. Development risk is moderate: the condition is chronic and the claimant is now represented.

WC-2024-01955 — Meridian Health Partners, Texas, workers' compensation. Incurred $285,549 (paid $48,697, reserved $236,852).
A patient care technician fell while transferring a patient in February 2025 and fractured her left hip. Initial fixation failed and a total hip replacement followed in June 2025. The treating physician found maximum improvement in February 2026 with an 18% whole-person impairment; the claimant disputed the rating and a designated doctor assessed 22% in June 2026. Impairment income benefits are being paid. The reserve is $110,000 for future hardware and therapy and $127,000 for the impairment balance and possible supplemental income benefits through 2027. No attorney is on file, but the rating dispute suggests representation is likely. The development risk is qualification for supplemental benefits.

WC-2024-01877 — Harbor Foods, Texas, workers' compensation. Incurred $281,945 (paid $140,419, reserved $141,526).
A warehouse selector strained his lower back lifting a sixty-pound case in December 2024. Conservative treatment failed; a disc herniation was found and, after two injections gave no relief, a spinal fusion was performed in August 2025. A functional capacity evaluation in March 2026 cleared him for medium-duty work, which the employer cannot accommodate; a vocational referral followed in May 2026. $140,000 has been paid, mostly for the surgery. The reserve is $65,000 medical and $77,000 indemnity, for temporary disability and then supplemental benefits. An attorney was retained in June 2026 and the adjuster expects litigation over the extent of injury, with a possible claim for the adjacent spinal segment. The reserve was reviewed in July 2026 and judged adequate.

GL-2024-02074 — Meridian Health Partners, Texas, general liability. Incurred $274,439 (paid $43,630, reserved $230,809).
A 71-year-old visitor fell in the parking garage of a clinic in October 2024, alleging an unmarked step at a change of level. She fractured her left wrist and cut her face, and later alleged cognitive decline following the fall. Liability is adverse: the incident report confirms the step and that there was no signage or contrast strip at the time; a strip was installed in January 2025. A demand of $850,000 was received in March 2026, including $180,000 of medical specials and future care; the adjuster values the claim at $225,000 to $300,000. Mediation is set for October 2026 and the excess carrier has been on notice since April 2026. Suit has not been filed; the limitation period runs to 27 October 2026. Development risk is high if the cognitive claim is supported.`,
    figures: [
      { key: 'claim.WC-2025-02326.incurred', text: '$310,639', value: 310638.72, tol: 1 },
      { key: 'claim.WC-2024-01907.incurred', text: '$302,292', value: 302291.6, tol: 1 },
      { key: 'claim.WC-2024-01955.incurred', text: '$285,549', value: 285548.7, tol: 1 },
      { key: 'claim.WC-2024-01877.paid', text: '$140,419', value: 140419.21, tol: 1 },
      { key: 'claim.GL-2024-02074.outstanding', text: '$230,809', value: 230809.01, tol: 1 },
    ],
  },

  {
    id: 'submission', step: 'submission', title: 'The submission narrative',
    model: 'Claude', recorded: '2026-07-20',
    gate: 'The risk manager edits it, then the broker sends it. The exhibits behind it are the pipeline\'s actuarial export and the engines\' tables, attached unchanged.',
    prompt: () => `${SYSTEM}

Draft the narrative section of a reinsurance submission for the captive's aggregate stop-loss renewal at 1 September 2026. Audience: a reinsurance underwriter. Cover the programme, the exposure, the loss history and its development, the current position, what is being asked for, and what has changed. Two pages at most. Use only the figures below.

PROGRAMME
Single-parent captive; five operating companies in Texas, Louisiana, Oklahoma, New Mexico, Arkansas and Colorado; workers' compensation, general liability and auto liability; $250,000 retention per occurrence; policy year 1 September to 31 August. Premium for 2026-27: $15,425,000, allocated to the operating companies by exposure adjusted for credible experience. Expected retained loss for 2026-27: $11,177,000 (a 72.5% expected loss ratio, from the captive's own eight years of development). Exposure for 2026-27: payroll $273,060,000, revenue $1,343,900,000, 1,295 vehicles.

LOSS HISTORY (standardised loss run at 31 August 2026; 2,567 claims, 858 open, 140 in litigation)
Reported incurred, all years: $62,243,584. Selected ultimate: $64,689,800. IBNR: $2,446,216.
Method: chain-ladder with a fitted tail; Bornhuetter-Ferguson at or under 24 months of development. Back-test on the synthetic ground truth: mature-year estimates land within 0.3% of the eventual cost; years at 24 months or younger within 3.8%.
Projected use of each year's aggregate: 2024-25 workers' compensation 110% (excess $582,504); 2021-22 general liability 105% (excess $113,829); all other year-lines under 100%, five of them between 90% and 99%.
2025-26 at 12 months: reported $7,886,364; selected ultimate $10,063,492; projected use of aggregate 75%.
Open claims at or above the $250,000 retention: 21, of which 13 workers' compensation and 6 from policy year 2024-25 (5 of those workers' compensation). Narratives attached for all 21.

EXPIRING COVER
Aggregate stop-loss attaching at 125% of expected retained loss, $10,000,000 limit, 5.0% of premium. No recoveries in the last five years.

REQUEST
Quotes at 115%, 125% and 135% attachment, $10,000,000 limit, ALAE included, no sunset, automatic cover for acquisitions to 15% of subject exposure.

CHANGES
Loss data is now produced daily by a validated pipeline rather than quarterly by hand; reserving is refreshed monthly. Meridian Health Partners expects to close the acquisition of Red River Clinics (about $10,900,000 payroll) on 1 December 2026, to be declared on closing.`,
    output: `AGGREGATE STOP-LOSS RENEWAL — 1 SEPTEMBER 2026
Narrative

The programme. The captive is a single-parent insurer writing workers' compensation, general liability and auto liability for five operating companies of its parent, with operations in six states, principally Texas. It retains $250,000 per occurrence on each line and has bought aggregate stop-loss protection above 125% of expected retained loss since inception. The policy year runs from 1 September. Premium for 2026-27 is $15,425,000, allocated to the operating companies by exposure and adjusted for each company's credible experience.

The exposure. For 2026-27 the companies report payroll of $273,060,000, revenue of $1,343,900,000 and 1,295 vehicles, each about 4.5% above the prior year. One change is known: Meridian Health Partners expects to complete the acquisition of Red River Clinics, with payroll of about $10,900,000, on 1 December 2026. That is roughly 4% of subject payroll and will be declared on closing under the acquisitions clause.

The loss history. Eight policy years are attached, standardised from the administrator's loss run at 31 August 2026: 2,567 claims, of which 858 are open and 140 are in litigation. Reported incurred across all years is $62,243,584. Developed to ultimate by chain-ladder with a fitted tail, and by Bornhuetter-Ferguson for the two youngest years, the selected ultimate is $64,689,800, leaving $2,446,216 of incurred-but-not-reported. The development method has been back-tested against the eventual cost of every claim: mature years land within 0.3%, years at 24 months or younger within 3.8%.

Erosion of the aggregates. Two year-lines are projected to exhaust their aggregate: 2024-25 workers' compensation at 110%, an excess of $582,504, and 2021-22 general liability at 105%, an excess of $113,829. Five further year-lines sit between 90% and 99%. The current year, 2025-26, stands at $7,886,364 reported at twelve months against a selected ultimate of $10,063,492, or 75% of its aggregate. The 2024-25 workers' compensation year is the one to read closely: 21 open claims stand at or above the retention across the book, and five of them belong to that one year-line. A narrative for each of the 21 is attached.

What has changed. Loss data is now produced daily by a validated pipeline from the administrator's file, with exceptions quarantined and every release signed, rather than assembled quarterly by hand. Reserving is refreshed monthly on the same data. The exhibits attached are the pipeline's own exports.

The request. Quotes are invited at 115%, 125% and 135% attachment on an aggregate limit of $10,000,000, with allocated loss adjustment expense included in ultimate net loss, no sunset clause, and automatic cover for acquisitions up to 15% of subject exposure. The expiring cover, at 125% and 5.0% of premium, has had no recoveries in the last five years.`,
    figures: [
      { key: 'dev.totals.latest', text: '$62,243,584', value: 62243583.67, tol: 1 },
      { key: 'dev.totals.selected', text: '$64,689,800', value: 64689800.14, tol: 1 },
      { key: 'dev.totals.ibnr', text: '$2,446,216', value: 2446216.47, tol: 1 },
      { key: 'dev.breach.WC.2024.excess', text: '$582,504', value: 582504.21, tol: 1 },
      { key: 'dev.breach.GL.2021.excess', text: '$113,829', value: 113828.58, tol: 1 },
      { key: 'dev.2025.latest', text: '$7,886,364', value: 7886363.63, tol: 1 },
      { key: 'dev.2025.selected', text: '$10,063,492', value: 10063491.58, tol: 1 },
      { key: 'claims.count', text: '2,567', value: 2567, tol: 0.5 },
      { key: 'claims.open', text: '858', value: 858, tol: 0.5 },
      { key: 'claims.litigated', text: '140', value: 140, tol: 0.5 },
      { key: 'claims.largeOpen', text: '21 open claims', value: 21, tol: 0.5 },
      { key: 'dev.backtest.mature', text: '0.3%', value: 0.003, tol: 0.0006, pct: true },
    ],
  },

  {
    id: 'quotes', step: 'submission', title: 'Compare three quotes, priced by the capital model',
    model: 'Claude', recorded: '2026-08-11',
    gate: 'The risk manager and the broker read it, then it goes into the board pack as the reinsurance section. The board decides.',
    prompt: () => `${SYSTEM}

Three quotes have been received for the aggregate stop-loss. The captive's capital model has priced the numeric terms of each: the probability that capital falls below the regulatory requirement at some point in the next three years, and the capital the captive would need to hold today to keep that probability under the board's 5% tolerance. It has also priced buying no cover. The model assumes an 18% coefficient of variation on the loss ratio; a sensitivity at 25% and 30% is given. The model does not read wording: it assumes the cover pays in full above the attachment.

Write the reinsurance section of the board paper. Compare the three quotes and the no-cover option on premium, on capital, and on wording, and recommend. Cost of capital for the parent is 10% a year. Capital today is $9,000,000. Subject premium is $15,425,000.

CAPITAL MODEL OUTPUT (2,000 simulated three-year paths each)
No cover: breach probability 7.8%; capital for 5% tolerance $9,814,000 (contribution $814,000); premium $0.
Quote A (expiring terms): attachment 125%, rate 5.0% ($771,250); breach probability 8.8%; capital for tolerance $9,686,000 (contribution $686,000).
Quote B: attachment 115%, rate 6.5% ($1,002,625); breach probability 5.5%; capital for tolerance $9,057,000 (contribution $57,000).
Quote C: attachment 135%, rate 3.8% ($586,150); breach probability 10.4%; capital for tolerance $10,087,000 (contribution $1,087,000).
Sensitivity, contribution needed for 5% tolerance: at 25% volatility, no cover $3,123,000, A $900,000, B $89,000. At 30% volatility, no cover $4,456,000, A $1,102,000, B $106,000.

TERM SHEETS
${QUOTES.map(q => `--- ${q.market}\n${q.terms}`).join('\n\n')}

OTHER FACTS
Meridian Health Partners expects to close an acquisition (about $10,900,000 payroll, 4% of subject) on 1 December 2026.
The claims pipeline flags every reserve above 50% of retention on the day it is set.`,
    output: `REINSURANCE: THE AGGREGATE STOP-LOSS AT 1 SEPTEMBER 2026

Three quotes were received against the submission, alongside the option of not renewing. The capital model priced each; the wording was read separately.

On premium and capital together. The board's test is the 5% tolerance for breaching the capital requirement over three years. Each option meets it with a different mix of premium and capital. Taking the parent's cost of capital at 10%:

| Option | Premium | Capital contribution to hold 5% | Annual cost, premium plus 10% of capital | Breach probability at $9.0m |
|---|---|---|---|---|
| No cover | $0 | $814,000 | $81,400 | 7.8% |
| A, expiring terms, 125% | $771,250 | $686,000 | $839,850 | 8.8% |
| B, 115% | $1,002,625 | $57,000 | $1,008,325 | 5.5% |
| C, 135% | $586,150 | $1,087,000 | $694,850 | 10.4% |

On the base assumption the cheapest way to hold the tolerance is not to buy: contribute $814,000 and pay no premium. Quote A, the cover the captive has renewed for years, costs $758,000 a year more than that for a higher breach probability at today's capital. It should not be renewed on its terms.

The catch is volatility. The no-cover option's capital need rises steeply if losses are more volatile than the eight-year history suggests: $3,123,000 at 25% volatility and $4,456,000 at 30%. Quote B's need barely moves, $89,000 and $106,000. B is therefore not a cheaper option but a more certain one: for about $1,000,000 of premium a year it removes the volatility question from the capital plan. That is a decision about how much capital the parent is willing to commit to the captive, and it belongs to the board rather than to the model.

On wording. The model assumes each cover pays in full above its attachment. Two of the term sheets do not.
- C excludes allocated loss adjustment expense from ultimate net loss and carries a $7,500,000 limit against the $10,000,000 requested, with a communicable disease exclusion. The model's figures for C therefore overstate its protection; its price is not comparable and it is not recommended without re-quoting on the terms requested.
- B excludes acquisitions unless declared within 30 days of closing and accepted, with additional premium. The Meridian acquisition closing on 1 December would need to be declared by 31 December; the expiring cover would have taken it automatically. B also makes 30-day reporting of any loss reserved above 50% of retention a condition precedent. The pipeline flags those reserves the day they are set, so the condition can be met, but it should be recorded as a control the captive now depends on. B's 36-month sunset is a genuine reduction in cover for slow-developing workers' compensation claims and should be negotiated out.
- A's wording is the expiring wording and needs no review.

Recommendation. Do not renew A. Put two options to the board: (1) no cover, with a capital contribution of $814,000 now and a commitment to re-test the capital need each quarter as the year develops; or (2) Quote B, subject to removal of the sunset clause and confirmation that the Meridian acquisition will be accepted at a stated additional premium, at $1,002,625. Option 2 is recommended if the parent is not prepared to commit further capital at plausible volatility, which on the sensitivities means up to $4,500,000. Option 1 is recommended if it is.`,
    figures: [
      { key: 'quote.none.breach', text: '7.8%', value: 0.078, tol: 0.002, pct: true },
      { key: 'quote.A.breach', text: '8.8%', value: 0.088, tol: 0.002, pct: true },
      { key: 'quote.B.breach', text: '5.5%', value: 0.0555, tol: 0.002, pct: true },
      { key: 'quote.C.breach', text: '10.4%', value: 0.104, tol: 0.002, pct: true },
      { key: 'quote.none.contribution', text: '$814,000', value: 813995, tol: 1000 },
      { key: 'quote.A.contribution', text: '$686,000', value: 686050, tol: 1000 },
      { key: 'quote.B.contribution', text: '$57,000', value: 56854, tol: 1000 },
      { key: 'quote.C.contribution', text: '$1,087,000', value: 1087051, tol: 1000 },
      { key: 'quote.A.premium', text: '$771,250', value: 771250, tol: 1 },
      { key: 'quote.B.premium', text: '$1,002,625', value: 1002625, tol: 1 },
      { key: 'quote.C.premium', text: '$586,150', value: 586150, tol: 1 },
      { key: 'quote.none.contribution.cv25', text: '$3,123,000', value: 3123000, tol: 5000 },
      { key: 'quote.none.contribution.cv30', text: '$4,456,000', value: 4456000, tol: 5000 },
    ],
  },

  {
    id: 'wording', step: 'bind', title: 'What changed in the contract wording',
    model: 'Claude', recorded: '2026-08-24',
    gate: 'Outside counsel reads the list, not the two contracts, and advises in an hour. The captive manager takes the marked clauses back to the market before binding.',
    prompt: () => `${SYSTEM}

The board has chosen Quote B for the aggregate stop-loss, subject to removal of the sunset clause and acceptance of the Meridian acquisition at a stated additional premium. Compare the expiring contract wording with the contract wording now drafted by Market B. List every difference. For each, say what it changes in practice for the reinsured, rate it material or not, and say whether to accept, negotiate or refuse, and why. Do not summarise clauses that are unchanged.

EXPIRING
${WORDING.expiring}

DRAFTED
${WORDING.bound}`,
    output: `All seven clauses changed. Four are material.

1. Clause 1, attachment: 125% becomes 115%, as quoted. Not material in itself; it is what was bought. The new words "to be agreed with the reinsurer's actuary before inception" are material: the attachment point now depends on a number the reinsurer's actuary must accept, and a higher agreed expected loss raises the attachment in dollars. Negotiate: the expected retained loss should be the figure certified in the submission, $11,177,000, stated in the contract as a dollar amount, with the actuary's agreement limited to that figure.

2. Clause 2, ultimate net loss: allocated loss adjustment expense is now included only in the proportion the reinsurer's liability for a loss bears to the whole loss, and extra-contractual obligations are excluded. Material. The reinsurer is liable only for the part of the year's losses above the attachment, so expense on every claim that erodes the aggregate below the attachment is not recovered at all, and expense on the claims above it is recovered only in part. On a year that reaches the aggregate with the usual mix of litigated claims, this is a five-figure to six-figure reduction against the expiring wording, which included expense in full. Negotiate: expense included in full as expiring; failing that, expense included in full on claims paid in whole or part by the reinsurer. The extra-contractual exclusion is standard and can be accepted.

3. Clause 3, reporting: 60 days from believing a claim likely to exceed half the retention becomes 30 days from a reserve above half the retention being set, and compliance becomes a condition precedent to liability. Material operationally. A single late report could void cover for that claim. The test is now objective (a reserve above $125,000) rather than a belief, which is easier to comply with, and the claims pipeline flags every such reserve on the day it is set. Negotiate: keep 30 days, replace the condition precedent with a prejudice test. If refused, accept and add the report to the pipeline's release gate so it cannot be missed.

4. Clause 4, acquisitions: automatic cover for acquired operations up to 15% of subject exposure becomes exclusion unless declared within 30 days of closing and accepted at additional premium. Material for the Meridian acquisition closing on 1 December: it must be declared by 31 December and the premium is at the reinsurer's discretion. Negotiate: the board's condition was acceptance at a stated additional premium; ask for the rate on Red River Clinics' payroll to be written into the contract now. Otherwise accept and calendar the declaration.

5. Clause 5, claims: the reinsured's sole control becomes a right for the reinsurer to associate in the defence of claims reserved above retention, at its own expense. Not material. Accept; the right to associate is not a right to control, and the reinsurer bears its own cost.

6. Clause 6, sunset: a claim first reported to the reinsurer more than 36 months after expiry is excluded. Material, and contrary to the board's condition. Workers' compensation claims on this book are still developing at 36 months; a claim that is small at expiry and deteriorates in year four would fall outside the cover even though it was on the loss run throughout. Refuse. If the market will not delete it, 60 months with "reported to the reinsured" as the test is the fallback the board should be asked to approve separately.

7. Clause 7, arbitration: the seat moves from the reinsured's domicile to the reinsurer's. Material for legal cost and predictability rather than cover. Negotiate a neutral seat or the expiring wording; not worth the placement on its own.

Order for the negotiation: clause 6 first, because it is a board condition; then 2, 1, 3, 4, 7. Clause 5 accept as drafted.`,
    figures: [
      { key: 'expectedLoss2026', text: '$11,177,000', value: 11177142, tol: 1000 },
    ],
  },
];

export const byStep = id => RUNS.filter(r => r.step === id);
export const runById = id => RUNS.find(r => r.id === id);
