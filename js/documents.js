// Maps the app's stored records onto the pure template functions, and
// describes which documents can be generated from each section. Keeps the
// template layer decoupled from the store shape.

import { store, single, activeCorp } from './state.js';
import * as T from '../templates/index.js';

// The stored e-signature for a document, or null.
export function signatureFor(docKey) {
  return (store.Signature || []).find((s) => s.docKey === docKey) || null;
}

export const MINUTE_BOOK_CATEGORY = 'Annual Minute Book';

// Assemble the compiled Annual Minute Book for a fiscal year.
// Returns { html, label } — pure composition over the store.
export function compileMinuteBook(fiscalYear) {
  const d = templateData();
  const fy = String(fiscalYear);
  const yearMatch = (v) => String(v || '').includes(fy);

  const annual = store.AnnualResolution.find((a) => yearMatch(a.fiscalYearCovered)) || null;
  const meeting = store.ShareholdersMeeting.find((m) => yearMatch(m.fiscalYear)) || null;
  const adhocs = store.AdHocResolution.filter((r) => String(r.date || '').startsWith(fy));
  const yearDocs = store.Document.filter((doc) =>
    doc.scope === 'year' && yearMatch(doc.fiscalYear) && doc.category !== MINUTE_BOOK_CATEGORY);

  const signatures = {};
  for (const s of store.Signature) signatures[s.docKey] = s;

  return {
    html: T.annualMinuteBook(d, { fiscalYear: fy, annual, meeting, adhocs, yearDocs, signatures }),
    label: `Annual Minute Book — FY ${fy}`,
  };
}

// Assemble the flat data object every template consumes. Scoped stores already
// hold only the active corp's records; `corp` is the active corporation.
export function templateData() {
  return {
    corp: activeCorp(),
    directors: store.Director,
    officers: store.Officer,
    shareClasses: store.ShareClass,
    shareholders: store.Shareholder,
    banking: single('BankingInfo'),
  };
}

// A document descriptor:
//   { id, label, build(): htmlString, registryType, periodCovered,
//     recordModel?, recordId? }  -- last two link back to a signable record.
export function documentsFor(sectionKey, record) {
  const d = templateData();
  switch (sectionKey) {
    case 'corp-info':
      return [{
        id: 'organizational', label: 'Organizational Resolution',
        docKey: 'organizational', signable: true,
        build: () => T.organizationalResolution({ ...d, signature: signatureFor('organizational') }),
        registryType: 'Organizational Resolution',
        periodCovered: 'Incorporation',
      }];
    case 'directors':
      return [{
        id: 'director-register', label: 'Register of Directors',
        build: () => T.directorRegister(d),
        registryType: 'Register of Directors',
        periodCovered: 'Current',
      }];
    case 'officers':
      return [{
        id: 'officer-register', label: 'Register of Officers',
        build: () => T.officerRegister(d),
        registryType: 'Register of Officers',
        periodCovered: 'Current',
      }];
    case 'shares':
      return [{
        id: 'share-register', label: 'Register of Shares',
        build: () => T.shareRegister(d),
        registryType: 'Register of Shares',
        periodCovered: 'Current',
      }];
    case 'banking':
      return [{
        id: 'banking-resolution', label: 'Banking Resolution',
        build: () => T.bankingResolution(d),
        registryType: 'Banking Resolution',
        periodCovered: 'Current',
      }];
    case 'annual': {
      if (!record) return [];
      const docKey = `annual:${record.id}`;
      return [{
        id: `annual-${record.id}`, label: `Annual Resolution — FY ${record.fiscalYearCovered || '—'}`,
        docKey, signable: true,
        build: () => T.annualResolution({ ...d, signature: signatureFor(docKey) }, record),
        registryType: 'Annual Resolution',
        periodCovered: `FY ${record.fiscalYearCovered || '—'}`,
        recordModel: 'AnnualResolution', recordId: record.id,
      }];
    }
    case 'shareholders-meeting': {
      if (!record) return [];
      const docKey = `shareholders:${record.id}`;
      return [{
        id: `shmeeting-${record.id}`, label: `Shareholders' Meeting — FY ${record.fiscalYear || '—'}`,
        docKey, signable: true,
        build: () => T.shareholdersMeeting({ ...d, signature: signatureFor(docKey) }, record),
        registryType: "Shareholders' Meeting Minutes",
        periodCovered: `FY ${record.fiscalYear || '—'}`,
        recordModel: 'ShareholdersMeeting', recordId: record.id,
      }];
    }
    case 'adhoc': {
      if (!record) return [];
      const docKey = `adhoc:${record.id}`;
      return [{
        id: `adhoc-${record.id}`, label: record.customTitle || record.type || 'Ad Hoc Resolution',
        docKey, signable: true,
        build: () => T.adHocResolution({ ...d, signature: signatureFor(docKey) }, record),
        registryType: record.type || 'Ad Hoc Resolution',
        periodCovered: record.date || 'Ad hoc',
        recordModel: 'AdHocResolution', recordId: record.id,
      }];
    }
    default:
      return [];
  }
}
