// Declarative form schema. The form engine (formEngine.js) reads these
// definitions and renders inputs generically. Each section maps to one or
// more backend @model types.
//
// Field types the engine understands:
//   text | textarea | date | number | select | multiselect | boolean
// Modifiers:
//   required: true            -> blocks PDF generation for that section until set
//   showIf: { field, equals } -> conditional visibility (sibling field)
//   options: [...]            -> for select / multiselect
//   help: '...'               -> hint text under the field
//
// A section with `repeatable: true` stores an array of records (one per row)
// and renders add/remove-row controls. Otherwise it stores a single record.

export const JURISDICTIONS = ['Ontario', 'Canada (Federal)'];
export const DIRECTOR_TITLES = ['President', 'Secretary', 'Treasurer', 'CEO', 'CFO', 'Chair'];
export const ACCOUNT_TYPES = ['Chequing', 'Savings', 'USD', 'Line of Credit', 'Credit Card'];
export const OFFICES = ['President', 'Secretary', 'Treasurer', 'CEO', 'CFO', 'COO', 'Chair', 'Vice-President'];

// Document categories by scope (for the Documents / uploads section).
export const DOC_CATEGORIES = {
  corporate: [
    'Articles of Incorporation', 'Certificate of Incorporation', 'By-laws',
    'Certificate / Endorsement (Master, Red Seal)', 'Shareholder Agreement', 'Other',
  ],
  year: [
    'Financial Statements', 'Tax Return (T2)', 'Notice to Reader',
    'Accountant Package', 'Working Papers', 'GST/HST', 'Other',
  ],
};

export const SECTIONS = {
  'corp-info': {
    label: 'Corporation Info',
    model: 'CorpInfo',
    repeatable: false,
    fields: [
      { name: 'legalName', label: 'Legal Name', type: 'text', required: true },
      { name: 'tradeNames', label: 'Trade / Operating Names', type: 'multiselect', options: [], freeform: true,
        help: 'Business names used in addition to the legal name (optional).' },
      { name: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
      { name: 'businessNumber', label: 'Business Number (BN)', type: 'text' },
      { name: 'jurisdiction', label: 'Jurisdiction', type: 'select', options: JURISDICTIONS, required: true },
      { name: 'incorporationDate', label: 'Incorporation Date', type: 'date', required: true },
      { name: 'registeredOffice', label: 'Registered Office Address', type: 'textarea', required: true },
      { name: 'mailingAddress', label: 'Mailing Address (if different)', type: 'textarea' },
      { name: 'parentCorpId', label: 'Parent Corporation', type: 'select', optionsFrom: 'corps',
        help: 'If this corporation is a subsidiary, select its parent (e.g. your holding corp).' },
    ],
  },

  'overview': {
    label: 'Overview',
    view: 'overview', // custom dashboard / intro
  },

  'directors': {
    label: 'Directors',
    model: 'Director',
    repeatable: true,
    rowLabel: (r) => r.name || 'New director',
    fields: [
      { name: 'name', label: 'Full Name', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'textarea', required: true },
      { name: 'titles', label: 'Titles / Offices', type: 'multiselect', options: DIRECTOR_TITLES, freeform: true, required: true },
      { name: 'appointmentDate', label: 'Appointment Date', type: 'date', required: true },
      { name: 'isSoleDirector', label: 'Sole Director', type: 'boolean' },
    ],
  },

  'officers': {
    label: 'Officers',
    model: 'Officer',
    repeatable: true,
    rowLabel: (r) => `${r.name || 'New officer'}${r.office ? ` — ${r.office}` : ''}`,
    fields: [
      { name: 'name', label: 'Full Name', type: 'text', required: true },
      { name: 'office', label: 'Office', type: 'select', options: OFFICES, required: true },
      { name: 'appointmentDate', label: 'Appointment Date', type: 'date' },
      { name: 'endDate', label: 'End Date (if resigned)', type: 'date' },
    ],
  },

  'shares': {
    label: 'Shares',
    // Two related models edited on one screen.
    groups: [
      {
        key: 'shareClasses', model: 'ShareClass', label: 'Share Classes', repeatable: true,
        rowLabel: (r) => r.className || 'New class',
        fields: [
          { name: 'className', label: 'Class Name', type: 'text', required: true, help: 'e.g. "Common", "Class A Special"' },
          { name: 'authorizedUnlimited', label: 'Unlimited authorized shares', type: 'boolean',
            help: 'Check for an unlimited number of authorized shares (common for Ontario corps).' },
          { name: 'authorized', label: 'Authorized', type: 'number', required: true,
            showIf: { field: 'authorizedUnlimited', equals: false }, help: 'Number of authorized shares (if not unlimited).' },
          { name: 'issued', label: 'Issued', type: 'number', required: true },
          { name: 'rightsRestrictions', label: 'Rights / Restrictions', type: 'textarea' },
        ],
      },
      {
        key: 'shareholders', model: 'Shareholder', label: 'Shareholders', repeatable: true,
        rowLabel: (r) => r.name || 'New shareholder',
        fields: [
          { name: 'shareholderCorpId', label: 'Shareholder is another corporation (in this book)', type: 'select', optionsFrom: 'corps',
            help: 'Optional — select if a corporation here holds these shares (e.g. your holding corp). Its name fills in automatically.' },
          { name: 'name', label: 'Shareholder Name', type: 'text',
            help: 'For an individual/outside shareholder. Leave blank if you selected a corporation above.' },
          { name: 'shareClassId', label: 'Share Class', type: 'select', optionsFrom: 'shareClasses', required: true },
          { name: 'quantity', label: 'Quantity', type: 'number', required: true },
          { name: 'certificateNumber', label: 'Certificate #', type: 'text' },
        ],
      },
    ],
  },

  'banking': {
    label: 'Banking',
    model: 'BankingInfo',
    repeatable: false,
    fields: [
      { name: 'bankName', label: 'Bank Name', type: 'text', required: true },
      { name: 'branchAddress', label: 'Branch Address', type: 'textarea', required: true },
      { name: 'signingOfficers', label: 'Signing Officers', type: 'multiselect', options: [], freeform: true, required: true,
        help: 'Names authorized to sign on the account.' },
      { name: 'accountTypes', label: 'Account Types', type: 'multiselect', options: ACCOUNT_TYPES, freeform: true, required: true },
    ],
  },

  'annual': {
    label: 'Annual Resolutions',
    model: 'AnnualResolution',
    repeatable: true,
    // Unlocked for now (process still being refined) — signed resolutions can
    // be edited/deleted. Re-add `immutableWhen: (r) => !!r.dateSigned` to lock.
    rowLabel: (r) => `FY ${r.fiscalYearCovered || '—'}${r.dateSigned ? ' (signed)' : ''}`,
    fields: [
      { name: 'fiscalYearCovered', label: 'Fiscal Year Covered', type: 'text', required: true, help: 'e.g. "2025" or "Year ended Dec 31, 2025"' },
      { name: 'financialStatementsApproved', label: 'Approve Financial Statements', type: 'boolean' },
      { name: 'directorContinuation', label: 'Continue Director(s) in Office', type: 'boolean' },
      { name: 'dividendDeclared', label: 'Declare a Dividend', type: 'boolean' },
      { name: 'dividendAmount', label: 'Dividend Amount ($)', type: 'number', showIf: { field: 'dividendDeclared', equals: true } },
      { name: 'dividendClass', label: 'Dividend on Class', type: 'text', showIf: { field: 'dividendDeclared', equals: true } },
      { name: 'auditWaiver', label: 'Waive Audit', type: 'boolean' },
      { name: 'dateSigned', label: 'Date Signed', type: 'date', help: 'Setting this locks the record.' },
    ],
  },

  'adhoc': {
    label: 'Ad Hoc Resolutions',
    model: 'AdHocResolution',
    repeatable: true,
    immutableWhen: (r) => !!r.dateSigned,
    rowLabel: (r) => `${r.customTitle || r.type || 'Resolution'}${r.dateSigned ? ' (signed)' : ''}`,
    fields: [
      { name: 'type', label: 'Type', type: 'select', required: true,
        options: ['Director Appointment', 'Director Resignation', 'Officer Appointment',
                  'Share Issuance', 'Share Transfer', 'Registered Office Change',
                  'Name Change', 'Dividend', 'Loan / Financing', 'Other'] },
      { name: 'customTitle', label: 'Custom Title', type: 'text', help: 'Optional override for the document heading.' },
      { name: 'date', label: 'Resolution Date', type: 'date', required: true },
      { name: 'details', label: 'Details / Operative Terms', type: 'textarea', required: true,
        help: 'The substance of what is resolved. Rendered into the "RESOLVED THAT" body.' },
      { name: 'dateSigned', label: 'Date Signed', type: 'date', help: 'Setting this locks the record.' },
    ],
  },

  'documents': {
    label: 'Documents',
    view: 'documents', // custom view — file uploads
  },
};

// Sidebar nav grouped into logical sections. `label: null` = ungrouped (top).
export const NAV_GROUPS = [
  { label: null, items: ['overview'] },
  { label: 'Corporate Structure', items: ['corp-info', 'directors', 'officers', 'shares'] },
  { label: 'Annual Updates', items: ['annual', 'adhoc'] },
  { label: 'Records & Documents', items: ['banking', 'documents'] },
];

export const NAV_ORDER = NAV_GROUPS.flatMap((g) => g.items);
