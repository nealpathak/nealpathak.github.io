// Demo material the renewal runs on, beyond the synthetic book: what the
// five operating companies sent back when asked for exposure, the adjuster
// notes behind the largest open claims, three reinsurance quotes, and the
// wording of the aggregate stop-loss contract expiring and as offered.
// All invented. Numbers are chosen to reconcile to data/book.mjs where the
// story needs them to, and to disagree with it where the story needs that.

export const RENEWAL = {
  inception: '2026-09-01',
  policyYear: 2026,
  dataAsOf: '2026-08-31',
  boardMeeting: '2026-08-19',
  tolerance: 0.05,
  startingCapital: 9000000,
};

// What came back from the exposure request. Five companies, five shapes.
export const EXPOSURE_REPLIES = [
  {
    entity: 'NLL', name: 'Northline Logistics', from: 'controller@northline.example', format: 'CSV attachment',
    subject: 'RE: FY27 exposure request',
    body: `Attached as requested. Revenue forecast for the year from 1 Sep is $298.6M. Payroll and units by state below, from the budget approved in July.

Entity,State,Budgeted Payroll,Power Units
Northline Logistics LLC,TX,"$32,851,500",297
Northline Logistics LLC,LA,"$8,959,500",81
Northline Logistics LLC,OK,"$8,959,500",81
Northline Logistics LLC,NM,"$5,973,000",54
Northline Logistics LLC,AR,"$2,986,500",27`,
  },
  {
    entity: 'HFD', name: 'Harbor Foods', from: 'jpatel@harborfoods.example', format: 'Email, figures in thousands',
    subject: 'exposure numbers',
    body: `Hi, here you go. All figures in $000s per our budget pack.

Payroll: 51,200
Revenue: 455,100
Vehicles: 171 (owned and long-term leased, excludes 14 trailers)

Split is the same as last year, 70/20/10 TX/LA/OK. Let me know if you need the class code detail.`,
  },
  {
    entity: 'CVS', name: 'Crestview Services', from: 'finance@crestview.example', format: 'Table pasted into email, one item missing',
    subject: 'RE: RE: FY27 exposure request - Crestview',
    body: `Per your request.

| Item | FY27 budget |
|---|---|
| Gross payroll | $39,820,000 |
| Revenue | $135,100,000 |
| Fleet | fleet manager will send separately |

State split unchanged: Texas 60%, Colorado 20%, New Mexico 20%.`,
  },
  {
    entity: 'MHP', name: 'Meridian Health Partners', from: 'hris-reports@meridianhp.example', format: 'System export, includes an acquisition',
    subject: 'Meridian FY27 payroll forecast (auto-generated)',
    body: `MERIDIAN HEALTH PARTNERS - WORKFORCE PLANNING EXPORT
Run date: 2026-06-03  Basis: FY27 forecast, all entities in scope

Total gross payroll (forecast)         $89,100,000
  of which: existing operations        $78,220,000
  of which: Red River Clinics (acq.)   $10,880,000   effective 2026-12-01, pending close
Revenue (forecast, existing ops)       $256,000,000
Vehicles (existing ops)                57
State split: TX 80% / OK 20% (existing operations)`,
  },
  {
    entity: 'SBG', name: 'Summit Build Group', from: 'dwalsh@summitbuild.example', format: 'Email, prior-year actuals sent instead of the forecast',
    subject: 'Re: exposure',
    body: `Here are the numbers from last year, is this what you need?

Payroll $42,190,000
Revenue $190,500,000
Trucks and equipment with plates: 218

We haven't finalised the FY27 budget yet, probably another two weeks.`,
  },
];

// Adjuster notes behind the largest open claims. Ids and amounts must match
// the book at the evaluation date; the tests check that they do.
export const ADJUSTER_NOTES = [
  {
    id: 'WC-2025-02326',
    notes: `09/25/25 FNOL rec'd. EE (RN, 14 yrs svc) slipped on wet floor in OK facility corridor, struck head and R shoulder. Transported ER. 09/30/25 CT neg for bleed, dx concussion + R rotator cuff tear. 11/12/25 arthroscopic repair, 6 wks TTD. 02/03/26 post-op MRI shows re-tear, ortho recommends revision. 04/21/26 revision surgery done. 06/15/26 RTW light duty 4 hrs/day. 07/30/26 IME sched 09/10/26. Rsv: med $165k (revision + PT + possible 3rd procedure), indem $84k (TTD through est MMI 01/27). No atty. Subro: none (own premises). Litigation risk low; claimant cooperative.`,
  },
  {
    id: 'WC-2024-01907',
    notes: `04/19/25 FNOL, late report (DOI 03/09/25, 41 days). EE (technician) lacerated L forearm on sheet metal, NM. Tx at urgent care, 12 sutures. 05/06/25 infection, admitted 4 days IV abx. 06/20/25 dx complex regional pain syndrome L arm. 09/15/25 pain mgmt referral, spinal cord stimulator trial. 01/08/26 SCS implanted. 04/02/26 EE reports 40% relief, remains TTD. Rsv: med $170k (SCS revision/replacement, ongoing pain mgmt), indem $67k. Late report noted; no compensability dispute. Atty letter rec'd 05/11/26, not yet litigated. Recommend early settlement discussion at MMI.`,
  },
  {
    id: 'WC-2024-01955',
    notes: `03/01/25 FNOL. EE (patient care tech) fell transferring patient, TX facility. L hip fx. 03/02/25 ORIF. 05/20/25 hardware complication, revision to THA 06/30/25. 10/01/25 PT ongoing, TTD. 02/17/26 MMI per treating, 18% WP impairment. 03/10/26 EE disputes rating, DD requested. 06/02/26 DD rating 22%. IIBs paid from 03/26. Rsv: med $110k (future hardware, PT), indem $127k (IIB balance + SIB exposure through 2027). No atty on file but DD dispute suggests representation likely. Watch for SIB qualification.`,
  },
  {
    id: 'WC-2024-01877',
    notes: `12/22/24 FNOL. EE (warehouse selector) lumbar strain lifting 60 lb case, TX. Conservative tx 8 wks, no improvement. 03/04/25 MRI L4-L5 herniation. 05/15/25 ESI x2 no relief. 08/20/25 L4-L5 fusion. 12/01/25 post-op, TTD. 03/18/26 FCE medium duty, ER cannot accommodate. 05/06/26 vocational referral. Paid to date $140k (surgery). Rsv: med $65k, indem $77k (TTD, then SIB). Atty retained 06/2026. Expect litigation on extent of injury; possible adjacent segment claim. Reserve reviewed 07/15/26, adequate.`,
  },
  {
    id: 'GL-2024-02074',
    notes: `12/13/24 claim rec'd via letter of rep. Visitor (age 71) fell in parking garage of TX clinic, alleged unmarked step at level change. Fx L wrist and facial laceration; later alleges cognitive decline post-fall. Liability: incident report confirms step, no signage or contrast strip at time; contrast strip installed 01/2025. Adverse. Demand $850k rec'd 03/2026, includes $180k medical specials and future care. Our eval $225-300k. Mediation set 10/14/26. Rsv $231k O/S. Excess carrier on notice 04/2026. Not yet in suit; SOL 10/27/26.`,
  },
];

// Three quotes for the aggregate stop-loss, as term sheets read. The numeric
// terms are priced by the capital model; the wording is for the model to
// read. The expiring cover is Market A's.
export const QUOTES = [
  {
    id: 'A', market: 'Market A (expiring)', attach: 1.25, cost: 0.05,
    terms: `Aggregate stop-loss reinsurance, captive as reinsured.
Period: 1 Sep 2026 to 31 Aug 2027, losses occurring.
Attachment: 125% of expected retained loss as certified at inception.
Limit: $10,000,000 in the aggregate excess of the attachment.
Rate: 5.0% of subject net written premium, minimum and deposit $700,000, adjustable at expiry.
Ultimate net loss: includes allocated loss adjustment expense.
Reinstatement: none.
Reporting: claims reported within 60 days of the reinsured becoming aware of a loss likely to exceed 50% of retention.
Sunset: none.
Acquisitions: covered automatically if declared within 90 days and payroll or revenue added is under 15% of subject; otherwise by endorsement.
Quote valid to 15 Aug 2026.`,
  },
  {
    id: 'B', market: 'Market B', attach: 1.15, cost: 0.065,
    terms: `Aggregate excess of loss, per attached slip.
Period: 12 months at 1 Sep 2026, losses occurring.
Attachment: 115% of expected retained loss, expected loss to be agreed with reinsurer's actuary.
Limit: $10,000,000 aggregate.
Rate: 6.5% of subject premium, flat.
Ultimate net loss: includes ALAE pro rata; excludes extra-contractual obligations.
Reinstatement: none.
Reporting: 30 days for any loss reserved above 50% of retention; late report is a condition precedent.
Sunset: claims must be reported to reinsurer within 36 months of expiry.
Acquisitions: excluded unless declared in writing within 30 days of closing and accepted by reinsurer, additional premium payable.
Claims control: reinsurer may associate in the defence of any claim reserved above retention.
Quote valid to 1 Aug 2026.`,
  },
  {
    id: 'C', market: 'Market C', attach: 1.35, cost: 0.038,
    terms: `Aggregate stop-loss.
Period: 1 Sep 2026 to 31 Aug 2027, losses occurring.
Attachment: 135% of expected retained loss as certified at inception.
Limit: $7,500,000 in the aggregate excess of the attachment.
Rate: 3.8% of subject net written premium, minimum $550,000.
Ultimate net loss: loss only; allocated loss adjustment expense excluded.
Reinstatement: none.
Reporting: within 30 days of any reserve above retention.
Sunset: none.
Acquisitions: automatic to 10% of subject exposure, declared at expiry.
Communicable disease exclusion applies.
Quote valid to 20 Aug 2026.`,
  },
];

// The contract as drafted by the chosen market against the expiring one.
export const WORDING = {
  expiring: `1. Attachment. The reinsurer shall be liable for ultimate net loss in excess of 125% of expected retained loss as certified at inception.
2. Ultimate net loss. The sum actually paid by the reinsured in settlement of losses, including allocated loss adjustment expense, after deduction of all recoveries.
3. Reporting. The reinsured shall report any claim it believes likely to exceed 50% of its retention within 60 days of forming that belief.
4. Acquisitions. Operations acquired during the period are covered automatically where declared within 90 days and the payroll or revenue added does not exceed 15% of subject exposure.
5. Claims. The reinsured shall have sole control of the investigation, defence and settlement of claims.
6. Sunset. None.
7. Arbitration. Disputes to arbitration in the domicile of the reinsured.`,
  bound: `1. Attachment. The reinsurer shall be liable for ultimate net loss in excess of 115% of expected retained loss, such expected retained loss to be agreed with the reinsurer's actuary before inception.
2. Ultimate net loss. The sum actually paid by the reinsured in settlement of losses, including allocated loss adjustment expense in the proportion that the reinsurer's liability for the loss bears to the total loss, after deduction of all recoveries. Extra-contractual obligations are excluded.
3. Reporting. The reinsured shall report any claim reserved above 50% of its retention within 30 days of the reserve being set. Compliance with this clause is a condition precedent to the reinsurer's liability.
4. Acquisitions. Operations acquired during the period are excluded unless declared in writing within 30 days of closing and accepted by the reinsurer, at such additional premium as the reinsurer may require.
5. Claims. The reinsurer may associate, at its own expense, in the defence of any claim reserved above the reinsured's retention.
6. Sunset. The reinsurer shall not be liable for any claim first reported to it more than 36 months after expiry of the period.
7. Arbitration. Disputes to arbitration in the domicile of the reinsurer.`,
};
