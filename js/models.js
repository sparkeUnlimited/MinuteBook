// The full model list and which models are corp-scoped (multi-tenant).
// CorpInfo is the tenant root (one record per corporation); every other model
// carries a `corpId` and is listed per corp.

export const ALL_MODELS = [
  'CorpInfo', 'Director', 'ShareClass', 'Shareholder', 'BankingInfo',
  'AnnualResolution', 'AdHocResolution', 'DocumentRegistryEntry',
  'Document', 'ShareholdersMeeting', 'Officer', 'SignificantControlPerson',
  'ShareTransfer',
];

export const SCOPED = new Set(ALL_MODELS.filter((m) => m !== 'CorpInfo'));
export const isScoped = (model) => SCOPED.has(model);
