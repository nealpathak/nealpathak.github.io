// The negotiation playbook — the actual asset this tool is built around.
//
// A playbook is data, not code: clause types, the position the organisation
// takes on each, the fallback it will accept, and the tests that decide whether
// a draft has strayed. Keeping it as a portable object means the same playbook
// can drive a checklist, a training deck, and a review queue, and that changing
// a position is an edit rather than a rewrite.
//
// Check types
//   mustNotMatch   fires when the pattern IS present
//   mustMatch      fires when the pattern is NOT present
//   numberAtLeast  extracts capture group 1 and fires when it falls below value
//   numberAtMost   extracts capture group 1 and fires when it exceeds value

export const SEVERITIES = ['critical', 'major', 'minor'];

export const ROUTING = [
  { worst: null, label: 'No approval needed', detail: 'Signable as drafted under standard delegation.' },
  { worst: 'minor', label: 'Contract owner', detail: 'Sign with the noted exceptions recorded on the file.' },
  { worst: 'major', label: 'Commercial lead and legal review', detail: 'Negotiate the major deviations before signature.' },
  { worst: 'critical', label: 'General counsel', detail: 'Do not sign. Escalate to outside counsel if the counterparty will not move.' },
];

export const DEFAULT_PLAYBOOK = {
  name: 'Standard inbound vendor services playbook',
  version: '2026.1',
  position: 'customer',
  clauses: [
    {
      id: 'lol',
      name: 'Limitation of liability',
      required: true,
      severityIfMissing: 'critical',
      terms: ['limitation of liability', 'aggregate liability', 'in no event shall', 'consequential damages', 'liability of the parties', 'total liability'],
      standard: 'Mutual cap at twelve months of fees, with carve-outs for confidentiality breach, indemnity obligations, gross negligence and wilful misconduct.',
      checks: [
        {
          id: 'lol-uncapped', label: 'Liability left uncapped on our side',
          type: 'mustNotMatch', severity: 'critical', enabled: true,
          pattern: 'unlimited liability|without limitation as to amount|shall have no cap|no limit on (?:the )?liability',
          finding: 'The draft leaves liability uncapped, which converts a commercial agreement into an open exposure the balance sheet has to carry.',
          fallback: 'Accept a cap at the greater of twelve months of fees or a stated dollar figure.',
          redline: 'Each party\'s total aggregate liability arising out of or related to this Agreement shall not exceed the greater of (a) the fees paid or payable in the twelve (12) months preceding the claim and (b) $1,000,000.',
        },
        {
          id: 'lol-mutual', label: 'Cap is not mutual',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'each party|either party|both parties|mutual',
          finding: 'The cap appears to run one way. A cap that protects only the counterparty is a cap on our recovery, not on our risk.',
          fallback: 'Make the cap mutual, even if the figure is asymmetric.',
          redline: 'Replace "Supplier\'s liability" with "Each party\'s liability" throughout the clause.',
        },
        {
          id: 'lol-multiple', label: 'Cap below twelve months of fees',
          type: 'numberAtLeast', severity: 'major', enabled: true, value: 12, unit: 'months of fees',
          pattern: '\\(?(\\d{1,3})\\)?\\s*months?[^.]{0,70}?fees|fees[^.]{0,70}?\\(?(\\d{1,3})\\)?\\s*months?',
          finding: 'The cap sits below the twelve months of fees this playbook treats as standard.',
          fallback: 'Six months is acceptable where annual contract value is under $100,000.',
          redline: 'Amend the cap period to twelve (12) months.',
        },
        {
          id: 'lol-carveouts', label: 'No carve-outs from the cap',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'gross negligence|wilful misconduct|willful misconduct|fraud',
          finding: 'The cap has no carve-outs. A cap that survives fraud and wilful misconduct is not a risk allocation, it is an indemnity against bad behaviour.',
          fallback: 'At minimum, carve out fraud, wilful misconduct and breach of confidentiality.',
          redline: 'Add: "The foregoing limitation shall not apply to a party\'s fraud, gross negligence, wilful misconduct, or breach of its confidentiality obligations."',
        },
      ],
    },
    {
      id: 'indemnity',
      name: 'Indemnification',
      required: true,
      severityIfMissing: 'critical',
      terms: ['indemnif', 'hold harmless', 'defend', 'third party claim', 'third-party claim'],
      standard: 'Mutual indemnity for third-party claims arising from the indemnifying party\'s breach, negligence or IP infringement. Control of defence with the indemnifying party; no settlement admitting our liability without consent.',
      checks: [
        {
          id: 'ind-oneway', label: 'Indemnity runs one way',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'each party (?:shall|will) indemnif|mutual(?:ly)? indemnif|(?:supplier|vendor|provider) (?:shall|will) indemnif',
          finding: 'No indemnity flows back to us. We are absorbing third-party claims caused by the counterparty.',
          fallback: 'A one-way indemnity is acceptable only where it runs in our favour.',
          redline: 'Add a reciprocal obligation: "Supplier shall indemnify, defend and hold harmless Customer against third-party claims arising from Supplier\'s breach, negligence, or infringement of intellectual property rights."',
        },
        {
          id: 'ind-ip', label: 'No IP infringement indemnity',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'infring|intellectual property (?:claim|right)',
          finding: 'The indemnity does not cover intellectual property infringement, which is the claim most likely to arrive from a third party in a services or software deal.',
          fallback: 'IP indemnity may be capped separately, but it should exist.',
          redline: 'Add IP infringement to the indemnified claims and exclude it from the liability cap.',
        },
        {
          id: 'ind-consent', label: 'Settlement without our consent',
          type: 'mustNotMatch', severity: 'major', enabled: true,
          pattern: 'settle[^.]{0,80}?(?:sole discretion|without (?:the )?(?:prior )?(?:written )?consent)',
          finding: 'The counterparty may settle a claim in our name without our consent, which puts an admission of liability outside our control.',
          fallback: 'Consent not to be unreasonably withheld is acceptable.',
          redline: 'Add: "No settlement that imposes any obligation or admission on the indemnified party shall be entered into without that party\'s prior written consent."',
        },
      ],
    },
    {
      id: 'insurance',
      name: 'Insurance requirements',
      required: true,
      severityIfMissing: 'major',
      terms: ['insurance', 'insured', 'commercial general liability', 'certificate of insurance', 'professional liability', 'errors and omissions', 'cyber liability'],
      standard: 'Commercial general liability of $1,000,000 per occurrence, professional liability or E&O of $2,000,000, cyber liability of $2,000,000 where data is processed, with certificates on request and thirty days\' notice of cancellation.',
      checks: [
        {
          id: 'ins-cgl', label: 'General liability limit below standard',
          type: 'numberAtLeast', severity: 'major', enabled: true, value: 1000000, unit: 'per occurrence',
          pattern: '\\$\\s?([\\d,]+)[^.]{0,80}?(?:per occurrence|each occurrence)',
          finding: 'The stated general liability limit is below the playbook minimum.',
          fallback: '$500,000 is acceptable for engagements under $50,000 with no site access.',
          redline: 'Amend the commercial general liability limit to $1,000,000 per occurrence.',
        },
        {
          id: 'ins-cyber', label: 'No cyber liability cover',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'cyber|data breach|privacy liability|network security',
          finding: 'No cyber cover is required. Where the counterparty touches personal or confidential data, this is the policy that actually responds.',
          fallback: 'Waive only where the vendor holds no data of ours whatsoever.',
          redline: 'Add: "Cyber liability insurance of not less than $2,000,000 per claim, covering network security and privacy liability."',
        },
        {
          id: 'ins-ai', label: 'Not named as additional insured',
          type: 'mustMatch', severity: 'minor', enabled: true,
          pattern: 'additional insured',
          finding: 'We are not named as an additional insured, so we cannot tender a claim directly to the counterparty\'s carrier.',
          fallback: 'Waive for professional liability, which is rarely written on an additional-insured basis.',
          redline: 'Add: "Customer shall be named as an additional insured on Supplier\'s commercial general liability policy."',
        },
      ],
    },
    {
      id: 'confidentiality',
      name: 'Confidentiality',
      required: true,
      severityIfMissing: 'critical',
      terms: ['confidential', 'non-disclosure', 'proprietary information', 'trade secret'],
      standard: 'Mutual, three-year survival from disclosure, standard carve-outs for public, independently developed, lawfully received and compelled disclosure, with return or destruction on termination.',
      checks: [
        {
          id: 'conf-term', label: 'Survival period beyond three years',
          type: 'numberAtMost', severity: 'minor', enabled: true, value: 3, unit: 'years',
          pattern: '\\(?(\\d{1,2})\\)?\\s*years?[^.]{0,90}?(?:confidential|disclos|terminat|expiration)',
          finding: 'The confidentiality obligation runs longer than the playbook standard. Long tails are hard to operationalise and harder to prove compliance with.',
          fallback: 'Five years is acceptable where the information includes pricing or product roadmap. Trade secrets may run indefinitely.',
          redline: 'Amend the survival period to three (3) years from the date of disclosure.',
        },
        {
          id: 'conf-carveouts', label: 'Missing standard carve-outs',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'publicly (?:available|known)|independently developed|rightfully received|required by law|compelled',
          finding: 'The definition has no carve-outs. Without them the clause covers information we already had or that is public, which is unenforceable in places and unmanageable everywhere.',
          fallback: 'None. This is standard in every jurisdiction.',
          redline: 'Add carve-outs for information that is public, already known, independently developed, rightfully received from a third party, or required to be disclosed by law.',
        },
        {
          id: 'conf-return', label: 'No return or destruction obligation',
          type: 'mustMatch', severity: 'minor', enabled: true,
          pattern: 'return or destroy|return and destroy|destruction of|return all',
          finding: 'Nothing requires the counterparty to return or destroy our information when the relationship ends.',
          fallback: 'Retention for backup or legal-hold purposes is acceptable if the confidentiality obligation survives.',
          redline: 'Add: "On termination or on written request, each party shall return or destroy the other\'s Confidential Information, save for copies retained under legal or regulatory obligation."',
        },
      ],
    },
    {
      id: 'term',
      name: 'Term and renewal',
      required: true,
      severityIfMissing: 'minor',
      terms: ['initial term', 'renewal term', 'renewal', 'automatically renew', 'auto-renew', 'shall renew', 'term of this agreement'],
      standard: 'Initial term stated, renewal by affirmative agreement or automatic renewal with no more than thirty days\' notice to prevent.',
      checks: [
        {
          id: 'term-notice', label: 'Non-renewal notice longer than thirty days',
          type: 'numberAtMost', severity: 'minor', enabled: true, value: 30, unit: 'days',
          pattern: '\\(?(\\d{1,3})\\)?\\s*(?:calendar |business )?days[^.]{0,90}?(?:renew|non-renewal|prior to the end)',
          finding: 'The notice window to stop renewal is longer than the playbook allows. Long windows are how agreements renew by accident.',
          fallback: 'Sixty days is acceptable where the vendor must hold capacity.',
          redline: 'Amend the non-renewal notice period to thirty (30) days.',
        },
        {
          id: 'term-evergreen', label: 'Evergreen renewal with a price escalator',
          type: 'mustNotMatch', severity: 'major', enabled: true,
          pattern: '(?:automatically renew|auto-renew)[^.]{0,160}?(?:increase|escalat|adjust)',
          finding: 'The agreement renews automatically and the price moves on renewal. That combination commits budget nobody re-approved.',
          fallback: 'Acceptable if the increase is capped at CPI or a stated percentage.',
          redline: 'Cap any renewal increase: "Fees shall not increase by more than the lesser of CPI and three percent (3%) on any renewal."',
        },
      ],
    },
    {
      id: 'termination',
      name: 'Termination for convenience',
      required: true,
      severityIfMissing: 'major',
      terms: ['termination for convenience', 'terminate for convenience', 'for convenience', 'without cause', 'terminate this agreement', 'termination'],
      standard: 'Termination for convenience on thirty days\' written notice, with a pro-rata refund of prepaid fees.',
      checks: [
        {
          id: 'term-conv-notice', label: 'Termination notice longer than sixty days',
          type: 'numberAtMost', severity: 'minor', enabled: true, value: 60, unit: 'days',
          pattern: '\\(?(\\d{1,3})\\)?\\s*(?:calendar |business )?days[^.]{0,90}?(?:terminat|convenience|without cause)|(?:terminat|convenience|without cause)[^.]{0,90}?\\(?(\\d{1,3})\\)?\\s*(?:calendar |business )?days',
          finding: 'The notice period to exit runs longer than the playbook standard.',
          fallback: 'Ninety days is acceptable where the vendor has dedicated staff to the account.',
          redline: 'Amend the termination notice period to thirty (30) days.',
        },
        {
          id: 'term-refund', label: 'No refund of prepaid fees',
          type: 'mustMatch', severity: 'minor', enabled: true,
          pattern: 'refund|pro[- ]rata|prorated',
          finding: 'Prepaid fees are not refundable on termination, so the exit right costs whatever remains on the term.',
          fallback: 'Non-refundable is acceptable where fees are paid monthly in arrears.',
          redline: 'Add: "On termination for convenience by Customer, Supplier shall refund any prepaid fees covering the period after the effective date of termination on a pro-rata basis."',
        },
      ],
    },
    {
      id: 'payment',
      name: 'Payment terms',
      required: true,
      severityIfMissing: 'minor',
      terms: ['payment terms', 'net thirty', 'net 30', 'invoice', 'undisputed', 'late payment', 'interest'],
      standard: 'Net thirty from receipt of a valid invoice, interest on late payment capped at 1% per month, disputed amounts withheld without penalty.',
      checks: [
        {
          id: 'pay-net', label: 'Payment window shorter than net thirty',
          type: 'numberAtLeast', severity: 'minor', enabled: true, value: 30, unit: 'days',
          pattern: '(?:net|within)[^.\\d]{0,18}?\\(?(\\d{1,3})\\)?\\s*(?:calendar |business )?days',
          finding: 'Payment is due faster than the playbook standard, which strains the accounts payable cycle and generates avoidable late fees.',
          fallback: 'Net fifteen is acceptable for a discount of 2% or better.',
          redline: 'Amend payment terms to net thirty (30) days from receipt of a valid invoice.',
        },
        {
          id: 'pay-interest', label: 'Late payment interest above 1% monthly',
          type: 'numberAtMost', severity: 'minor', enabled: true, value: 1, unit: '% per month',
          pattern: '\\(?(\\d+(?:\\.\\d+)?)\\)?\\s*(?:%|percent)\\s*per month',
          finding: 'Late payment interest exceeds the playbook ceiling and may be unenforceable as a penalty in some jurisdictions.',
          fallback: '1.5% per month where the counterparty is a small supplier.',
          redline: 'Amend the late payment rate to one percent (1%) per month or the maximum permitted by law, whichever is lower.',
        },
        {
          id: 'pay-dispute', label: 'No right to withhold disputed amounts',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'disputed|good faith dispute|bona fide dispute',
          finding: 'Nothing lets us withhold a disputed invoice, so every billing disagreement becomes a breach the moment we hold payment.',
          fallback: 'None. This is the clause that keeps a billing dispute out of a termination notice.',
          redline: 'Add: "Customer may withhold payment of any amount disputed in good faith without such withholding constituting a breach, provided Customer pays all undisputed amounts when due."',
        },
      ],
    },
    {
      id: 'data',
      name: 'Data protection',
      required: true,
      severityIfMissing: 'critical',
      terms: ['personal data', 'personal information', 'data protection', 'data processing', 'gdpr', 'ccpa', 'hipaa', 'privacy', 'security incident', 'breach notification'],
      standard: 'A data processing addendum where personal data is processed, breach notification within seventy-two hours, no onward transfer without notice, and deletion on termination.',
      checks: [
        {
          id: 'data-notice', label: 'Breach notification slower than 72 hours',
          type: 'numberAtMost', severity: 'critical', enabled: true, value: 72, unit: 'hours',
          pattern: '\\(?(\\d{1,3})\\)?\\s*hours[^.]{0,90}?(?:notif|breach|incident)|(?:notif|breach|incident)[^.]{0,90}?\\(?(\\d{1,3})\\)?\\s*hours',
          finding: 'Breach notification runs slower than seventy-two hours, which will not leave enough time to meet our own downstream regulatory clocks.',
          fallback: 'None where regulated data is in scope.',
          redline: 'Amend to: "Supplier shall notify Customer without undue delay and in any event within seventy-two (72) hours of becoming aware of a Security Incident."',
        },
        {
          id: 'data-subprocessor', label: 'Subprocessors without notice',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'sub-?processor|subcontractor[^.]{0,60}?(?:notice|consent|approv)',
          finding: 'Nothing controls onward transfer to subprocessors, so our data can move to parties we have never assessed.',
          fallback: 'A published subprocessor list with notice of change is acceptable.',
          redline: 'Add: "Supplier shall give Customer thirty (30) days\' notice before engaging any new subprocessor, and Customer may object on reasonable data protection grounds."',
        },
      ],
    },
    {
      id: 'ip',
      name: 'Intellectual property',
      required: true,
      severityIfMissing: 'major',
      terms: ['intellectual property', 'ownership', 'work product', 'deliverables', 'license to use', 'background ip', 'pre-existing'],
      standard: 'Each party keeps its background IP. Deliverables created for us vest in us or come with a perpetual, irrevocable licence for our internal purposes.',
      checks: [
        {
          id: 'ip-background', label: 'Background IP assigned away',
          type: 'mustNotMatch', severity: 'critical', enabled: true,
          pattern: '(?:customer|client)[^.]{0,60}?(?:hereby assigns|shall assign|assigns to (?:supplier|vendor|provider))',
          finding: 'The draft assigns our pre-existing intellectual property to the counterparty. This is rarely intended and almost never noticed until the relationship ends.',
          fallback: 'None. Background IP does not move.',
          redline: 'Replace with: "Each party retains all right, title and interest in its pre-existing intellectual property. Nothing in this Agreement transfers ownership of either party\'s background IP."',
        },
        {
          id: 'ip-deliverables', label: 'No licence to deliverables',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'licen[cs]e|assign|vest|own(?:s|ership) of the deliverable',
          finding: 'Nothing states what we may do with what we paid to have built.',
          fallback: 'A perpetual, irrevocable, internal-use licence is acceptable in place of ownership.',
          redline: 'Add: "Supplier grants Customer a perpetual, irrevocable, worldwide, royalty-free licence to use, modify and reproduce the Deliverables for its internal business purposes."',
        },
      ],
    },
    {
      id: 'assignment',
      name: 'Assignment and change of control',
      required: false,
      severityIfMissing: 'minor',
      terms: ['assign', 'assignment', 'change of control', 'successors and assigns', 'merger'],
      standard: 'Neither party assigns without consent, except to an affiliate or in connection with a merger or sale of substantially all assets.',
      checks: [
        {
          id: 'assign-coc', label: 'No carve-out for change of control',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'change of control|merger|sale of (?:all|substantially all)|affiliate',
          finding: 'Assignment needs consent with no carve-out for corporate transactions, which hands the counterparty a consent right over our own reorganisation.',
          fallback: 'Notice rather than consent is acceptable.',
          redline: 'Add: "Either party may assign this Agreement without consent to an affiliate or in connection with a merger, acquisition, or sale of all or substantially all of its assets."',
        },
      ],
    },
    {
      id: 'dispute',
      name: 'Governing law and dispute resolution',
      required: true,
      severityIfMissing: 'major',
      terms: ['governing law', 'governed by the laws', 'jurisdiction', 'venue', 'arbitration', 'jury trial', 'dispute'],
      standard: 'Governing law and venue in a state where we have a presence. Litigation preferred; arbitration acceptable only if seated conveniently and not on a mass-consumer basis.',
      checks: [
        {
          id: 'dis-arbitration', label: 'Binding arbitration imposed',
          type: 'mustNotMatch', severity: 'major', enabled: true,
          pattern: 'binding arbitration|shall be (?:finally )?(?:settled|resolved) by arbitration',
          finding: 'Disputes go to binding arbitration. That removes appeal rights, removes discovery, and moves cost to the front of the process.',
          fallback: 'Acceptable where the seat is convenient and each party bears its own costs.',
          redline: 'Replace the arbitration clause with exclusive jurisdiction of the state and federal courts of our home state.',
        },
        {
          id: 'dis-jury', label: 'Jury trial waived',
          type: 'mustNotMatch', severity: 'minor', enabled: true,
          pattern: 'waive[sd]?[^.]{0,60}?(?:jury|trial by jury)',
          finding: 'The draft waives the right to a jury trial. Ordinary in commercial agreements, but it is a right being given away and should be a decision rather than an oversight.',
          fallback: 'Generally acceptable. Note it and move on.',
          redline: 'Strike the jury trial waiver, or accept it as a knowing exception.',
        },
      ],
    },
    {
      id: 'nonsolicit',
      name: 'Non-solicitation',
      required: false,
      severityIfMissing: null,
      terms: ['non-solicit', 'not solicit', 'shall not hire', 'no-hire', 'solicitation of employees'],
      standard: 'No non-solicit at all where avoidable. Where required, no longer than twelve months and limited to employees who worked on the engagement.',
      checks: [
        {
          id: 'ns-duration', label: 'Non-solicit longer than twelve months',
          type: 'numberAtMost', severity: 'major', enabled: true, value: 12, unit: 'months',
          pattern: '\\(?(\\d{1,2})\\)?\\s*months[^.]{0,140}?(?:solicit|hire|employ)',
          finding: 'The non-solicit runs longer than the playbook ceiling and constrains hiring well past the engagement.',
          fallback: 'Eighteen months where the counterparty has seconded named staff.',
          redline: 'Reduce the non-solicitation period to twelve (12) months from the end of the engagement.',
        },
        {
          id: 'ns-scope', label: 'Non-solicit not limited to engaged staff',
          type: 'mustMatch', severity: 'major', enabled: true,
          pattern: 'who (?:worked|performed|provided)|engaged (?:in|on)|involved in the (?:services|engagement)',
          finding: 'The non-solicit reaches the whole organisation rather than the people who actually worked on the engagement. That is a hiring freeze, not a protection.',
          fallback: 'None. Scope it to engaged personnel.',
          redline: 'Limit the restriction to personnel who performed services under this Agreement.',
        },
        {
          id: 'ns-general', label: 'No carve-out for general advertising',
          type: 'mustMatch', severity: 'minor', enabled: true,
          pattern: 'general (?:advertis|solicitation)|job (?:posting|board)|not (?:specifically )?directed',
          finding: 'Without a general-advertising carve-out, an ordinary job posting technically breaches the clause.',
          fallback: 'None. This carve-out is standard and uncontroversial.',
          redline: 'Add: "This restriction does not apply to general advertising or recruitment not specifically directed at the other party\'s personnel."',
        },
      ],
    },
    {
      id: 'audit',
      name: 'Audit and records',
      required: false,
      severityIfMissing: 'minor',
      terms: ['audit', 'inspect', 'books and records', 'right to examine'],
      standard: 'Right to audit records relevant to fees and compliance once a year on reasonable notice, at our cost unless a material discrepancy is found.',
      checks: [
        {
          id: 'audit-cost', label: 'Audit costs fall on us regardless of findings',
          type: 'mustMatch', severity: 'minor', enabled: true,
          pattern: 'discrepanc|overcharg|error of|exceeds? (?:\\d|five|three) ?%',
          finding: 'Audit cost sits with us even when the audit finds an overcharge, which removes the incentive that makes the right worth having.',
          fallback: 'None. A shifting-cost trigger is standard.',
          redline: 'Add: "If an audit reveals an overcharge exceeding five percent (5%), Supplier shall bear the cost of the audit and refund the overcharge."',
        },
      ],
    },
  ],
};

/** Deep clone so the interface never mutates the shipped default. */
export function clonePlaybook(pb = DEFAULT_PLAYBOOK) {
  return {
    ...pb,
    clauses: pb.clauses.map(c => ({
      ...c,
      terms: [...c.terms],
      checks: c.checks.map(k => ({ ...k })),
    })),
  };
}
