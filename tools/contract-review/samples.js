// Synthetic contracts. Every party, figure and term below is invented. Nothing
// here is derived from, or representative of, any real agreement, counterparty,
// client, or employer.
//
// The three drafts are written to sit at different points against the same
// playbook: one aggressive vendor paper, one ordinary subscription agreement,
// and one that has already been negotiated. A checker that only ever produces
// alarm is as useless as one that never does.

export const SAMPLES = [
  {
    id: 'vendor-msa',
    label: 'Vendor MSA — first draft on their paper',
    note: 'Supplier-favourable throughout. This is what arrives before anyone has negotiated.',
    text: `MASTER SERVICES AGREEMENT

This Master Services Agreement (the "Agreement") is entered into as of 1 March 2026 between Meridian Delivery Systems, Inc., a Delaware corporation ("Supplier"), and the counterparty identified on the Order Form ("Customer").

1. SERVICES
1.1 Supplier shall provide the professional services described in each Order Form executed by the parties. Supplier may modify the scope, staffing, or delivery method of the Services at any time upon notice to Customer.
1.2 Customer shall provide such cooperation, access, information, and materials as Supplier reasonably requires to perform the Services.

2. FEES AND PAYMENT
2.1 Customer shall pay all invoiced amounts within fifteen (15) days of the invoice date. All fees are non-refundable and are exclusive of taxes.
2.2 Any amount not paid when due shall bear interest at one and one-half percent (1.5%) per month or the maximum rate permitted by law, whichever is greater.
2.3 Customer shall reimburse Supplier for all reasonable travel and out-of-pocket expenses incurred in connection with the Services.

3. TERM AND RENEWAL
3.1 This Agreement commences on the Effective Date and continues for an initial term of twenty-four (24) months.
3.2 This Agreement shall automatically renew for successive twelve (12) month periods, and Supplier may increase the fees by up to seven percent (7%) upon each such renewal, unless either party delivers written notice of non-renewal not less than ninety (90) days prior to the end of the then-current term.

4. INTELLECTUAL PROPERTY
4.1 All work product, deliverables, methodologies, and derivative works arising from the Services shall be the sole and exclusive property of Supplier.
4.2 Customer hereby assigns to Supplier all right, title and interest in any materials, data, specifications, or feedback provided by Customer in connection with the Services.

5. CONFIDENTIALITY
5.1 Each party shall hold the other party's Confidential Information in strict confidence and shall not disclose it to any third party for a period of five (5) years following termination of this Agreement.
5.2 Confidential Information means all information disclosed by either party, whether or not marked as confidential.

6. LIMITATION OF LIABILITY
6.1 Supplier's total aggregate liability arising out of or relating to this Agreement shall not exceed the fees actually paid by Customer in the three (3) months immediately preceding the event giving rise to the claim.
6.2 In no event shall Supplier be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, or data, however caused.
6.3 Customer shall have no cap on liability arising from its payment obligations, its use of the Services, or its breach of Section 4 or Section 9.

7. INDEMNIFICATION
7.1 Customer shall indemnify, defend and hold harmless Supplier, its officers, directors, employees and agents from and against any and all third party claims, losses, damages, liabilities, costs and expenses arising out of or relating to the Services, Customer's data, or Customer's breach of this Agreement.
7.2 Supplier may settle any such claim in its sole discretion, and Customer shall pay all amounts so settled together with Supplier's costs of defence.

8. ASSIGNMENT
8.1 Neither party may assign or transfer this Agreement, in whole or in part, without the prior written consent of the other party, which consent may be withheld in that party's absolute discretion.

9. NON-SOLICITATION
9.1 During the Term and for twenty-four (24) months thereafter, Customer shall not directly or indirectly solicit, recruit, or hire any employee, contractor, or agent of Supplier.

10. GOVERNING LAW AND DISPUTE RESOLUTION
10.1 This Agreement shall be governed by the laws of the State of California without regard to its conflict of laws principles.
10.2 Any dispute arising out of or relating to this Agreement shall be finally settled by binding arbitration administered in Santa Clara County, California, and each party waives any right to trial by jury.

11. GENERAL
11.1 This Agreement constitutes the entire agreement between the parties and supersedes all prior discussions. No modification is effective unless in writing and signed by both parties.
11.2 If any provision is held unenforceable, the remaining provisions shall continue in full force and effect.`,
  },

  {
    id: 'saas',
    label: 'SaaS subscription — mid-negotiation',
    note: 'Ordinary market paper. Some positions already conceded, several still open.',
    text: `SUBSCRIPTION AGREEMENT

This Subscription Agreement is entered into between Larkfield Analytics Ltd ("Provider") and the subscribing entity identified in the Order Form ("Customer").

1. SUBSCRIPTION AND ACCESS
1.1 Provider grants Customer a non-exclusive, non-transferable right to access and use the hosted platform described in the Order Form during the Subscription Term.
1.2 Provider shall use commercially reasonable efforts to make the platform available not less than 99.5% of each calendar month, excluding scheduled maintenance.

2. FEES AND PAYMENT
2.1 Customer shall pay subscription fees annually in advance, net thirty (30) days from receipt of a valid invoice.
2.2 Customer may withhold any amount disputed in good faith provided Customer notifies Provider in writing and pays all undisputed amounts when due.
2.3 Overdue undisputed amounts accrue interest at one percent (1%) per month.

3. TERM AND RENEWAL
3.1 The initial Subscription Term is twelve (12) months from the Effective Date.
3.2 The Subscription Term shall automatically renew for successive twelve (12) month periods unless either party gives written notice of non-renewal not less than sixty (60) days prior to the end of the then-current term.

4. TERMINATION
4.1 Either party may terminate this Agreement for material breach that remains uncured thirty (30) days after written notice.
4.2 Customer may terminate this Agreement for convenience upon sixty (60) days' written notice to Provider. Fees already paid are non-refundable.

5. INTELLECTUAL PROPERTY
5.1 Each party retains all right, title and interest in its pre-existing intellectual property. Provider grants Customer a licence to use the platform and any reports generated through it for Customer's internal business purposes.
5.2 Customer Data remains the property of Customer at all times.

6. CONFIDENTIALITY
6.1 Each party shall protect the other's Confidential Information with no less than reasonable care and shall not disclose it for a period of three (3) years following the date of disclosure.
6.2 Confidential Information excludes information that is or becomes publicly available through no fault of the receiving party, was independently developed without reference to the disclosing party's information, or was rightfully received from a third party without restriction, or which the receiving party is required by law to disclose.
6.3 Upon termination each party shall return or destroy the other's Confidential Information on written request.

7. DATA PROTECTION AND SECURITY
7.1 Provider shall process Customer personal data only in accordance with the Data Processing Addendum attached as Exhibit B and applicable data protection law.
7.2 Provider shall notify Customer of any Security Incident affecting Customer Data within ninety-six (96) hours of becoming aware of it.
7.3 Provider maintains a published list of subprocessors and will use commercially reasonable efforts to keep it current.

8. WARRANTIES
8.1 Each party warrants that it has full power and authority to enter into this Agreement.
8.2 Provider warrants that the platform will perform materially in accordance with its published documentation.

9. LIMITATION OF LIABILITY
9.1 Each party's total aggregate liability arising out of or relating to this Agreement shall not exceed the fees paid or payable in the six (6) months preceding the claim.
9.2 Neither party shall be liable for indirect, incidental, consequential, or punitive damages.
9.3 The limitations in this Section shall not apply to either party's fraud or wilful misconduct.

10. INDEMNIFICATION
10.1 Provider shall indemnify, defend and hold harmless Customer against third party claims alleging that the platform infringes any intellectual property right of a third party.
10.2 Customer shall indemnify Provider against third party claims arising from Customer Data or Customer's unlawful use of the platform.
10.3 No settlement imposing any obligation or admission on an indemnified party shall be entered into without that party's prior written consent, not to be unreasonably withheld.

11. INSURANCE
11.1 Provider shall maintain commercial general liability insurance of not less than $1,000,000 per occurrence and professional liability insurance of not less than $2,000,000 in the aggregate, and shall provide certificates of insurance on request.

12. ASSIGNMENT
12.1 Neither party may assign this Agreement without the other's prior written consent, except that either party may assign it in connection with a merger, acquisition, or sale of all or substantially all of its assets on written notice.

13. GOVERNING LAW AND DISPUTES
13.1 This Agreement is governed by the laws of the State of Texas.
13.2 The parties submit to the exclusive jurisdiction of the state and federal courts located in Harris County, Texas, and each party waives its right to trial by jury.

14. AUDIT
14.1 Customer may, on thirty (30) days' notice and not more than once per year, audit Provider's records relevant to the fees charged under this Agreement. Customer shall bear the cost of any such audit.`,
  },

  {
    id: 'negotiated',
    label: 'Services agreement — post-negotiation',
    note: 'The same playbook applied to a draft that has already been through review. ' +
          'This is what a clean result should look like.',
    text: `PROFESSIONAL SERVICES AGREEMENT

This Professional Services Agreement is entered into between Ashcombe Consulting Group LLC ("Supplier") and the client identified on the Statement of Work ("Customer").

1. SERVICES
1.1 Supplier shall perform the services described in each Statement of Work executed by both parties. No change to scope, staffing, or fees is effective unless agreed in writing by both parties.

2. FEES AND PAYMENT
2.1 Customer shall pay undisputed invoiced amounts net thirty (30) days from receipt of a valid invoice.
2.2 Customer may withhold any amount subject to a good faith dispute without such withholding constituting a breach, provided Customer pays all undisputed amounts when due.
2.3 Undisputed amounts not paid when due accrue interest at one percent (1%) per month.

3. TERM AND RENEWAL
3.1 The initial term is twelve (12) months from the Effective Date.
3.2 This Agreement shall automatically renew for successive twelve (12) month periods unless either party gives written notice of non-renewal not less than thirty (30) days prior to the end of the then-current term. Fees shall not increase on renewal by more than the lesser of CPI and three percent (3%).

4. TERMINATION FOR CONVENIENCE
4.1 Customer may terminate this Agreement or any Statement of Work for convenience upon thirty (30) days' written notice.
4.2 Supplier shall refund any prepaid fees covering the period after the effective date of termination on a pro-rata basis.

5. INTELLECTUAL PROPERTY
5.1 Each party retains all right, title and interest in its pre-existing intellectual property. Nothing in this Agreement transfers ownership of either party's background intellectual property.
5.2 Supplier grants Customer a perpetual, irrevocable, worldwide, royalty-free licence to use, modify and reproduce the Deliverables for Customer's internal business purposes.

6. CONFIDENTIALITY
6.1 Each party shall hold the other's Confidential Information in confidence and shall not disclose it for a period of three (3) years following the date of disclosure.
6.2 Confidential Information does not include information that is publicly available through no fault of the recipient, was already known to the recipient, was independently developed without use of the disclosing party's information, was rightfully received from a third party, or is required by law to be disclosed.
6.3 On termination or on written request, each party shall return or destroy the other's Confidential Information, save for copies retained under legal or regulatory obligation.

7. DATA PROTECTION
7.1 Where Supplier processes personal data on Customer's behalf, it shall do so only in accordance with Customer's documented instructions and applicable data protection law.
7.2 Supplier shall notify Customer without undue delay and in any event within seventy-two (72) hours of becoming aware of any Security Incident affecting Customer data.
7.3 Supplier shall give Customer thirty (30) days' notice before engaging any new subprocessor, and Customer may object on reasonable data protection grounds.

8. LIMITATION OF LIABILITY
8.1 Each party's total aggregate liability arising out of or relating to this Agreement shall not exceed the greater of the fees paid or payable in the twelve (12) months preceding the claim and one million dollars ($1,000,000).
8.2 Neither party shall be liable for indirect, incidental, special, consequential, or punitive damages.
8.3 The foregoing limitations shall not apply to a party's fraud, gross negligence, wilful misconduct, or breach of its confidentiality obligations.

9. INDEMNIFICATION
9.1 Each party shall indemnify, defend and hold harmless the other against third party claims arising from the indemnifying party's breach of this Agreement, negligence, or infringement of any third party intellectual property right.
9.2 The indemnifying party shall control the defence, provided that no settlement imposing any obligation or admission on the indemnified party shall be entered into without that party's prior written consent.

10. INSURANCE
10.1 Supplier shall maintain, at its own expense: commercial general liability insurance of not less than $1,000,000 per occurrence; professional liability insurance of not less than $2,000,000 per claim; and cyber liability insurance of not less than $2,000,000 per claim covering network security and privacy liability.
10.2 Customer shall be named as an additional insured on Supplier's commercial general liability policy, and Supplier shall provide certificates of insurance on request.

11. ASSIGNMENT
11.1 Neither party may assign this Agreement without the other's prior written consent, except that either party may assign it to an affiliate or in connection with a merger, acquisition, or sale of all or substantially all of its assets.

12. NON-SOLICITATION
12.1 During the term and for twelve (12) months thereafter, neither party shall solicit for employment any personnel of the other party who performed or received services under this Agreement. This restriction does not apply to general advertising or recruitment not specifically directed at the other party's personnel.

13. GOVERNING LAW AND DISPUTE RESOLUTION
13.1 This Agreement is governed by the laws of the State of Texas without regard to its conflict of laws principles.
13.2 The parties submit to the exclusive jurisdiction of the state and federal courts located in Harris County, Texas.

14. AUDIT AND RECORDS
14.1 Customer may, on reasonable notice and not more than once in any twelve month period, audit Supplier's books and records relevant to the fees charged and Supplier's compliance with this Agreement.
14.2 If an audit reveals an overcharge exceeding five percent (5%), Supplier shall bear the cost of the audit and refund the overcharge within thirty (30) days.`,
  },
];

export function loadSample(id) {
  return SAMPLES.find(s => s.id === id) ?? SAMPLES[0];
}
