// AWS AppSync (GraphQL) + DynamoDB adapter.
//
// Activates automatically once js/config.js has an appsync.endpoint (see
// amplify-setup.js). Until then dataClient.js falls back to the localAdapter,
// so the app runs with no AWS account.
//
// Design notes:
// - Shares the single Amplify configuration in amplify-setup.js (same instance
//   the auth layer uses), so requests are authorized with the signed-in
//   Cognito user-pool session (authMode: 'userPool').
// - Immutability of signed resolutions is enforced in the UI (formEngine),
//   not here; DynamoDB will happily mutate, so the guard lives client-side.

import { ensureAmplifyConfigured } from '../amplify-setup.js';
import { isScoped } from '../models.js';

const API_ESM = 'https://esm.sh/aws-amplify@6/api';

// Minimal generic GraphQL documents. The Amplify CLI generates fully-typed
// queries in src/graphql, but for a vanilla no-build app we hand-write the
// operations we need. Field selection is intentionally "*"-ish per model.
// Field selection per model. Scoped models include `corpId` (the tenant key).
const SELECTION = {
  CorpInfo: 'id legalName tradeNames corporationNumber businessNumber jurisdiction incorporationDate registeredOffice mailingAddress updatedAt',
  Director: 'id corpId name address titles appointmentDate isSoleDirector',
  ShareClass: 'id corpId className authorized authorizedUnlimited issued rightsRestrictions',
  Shareholder: 'id corpId name shareClassId quantity certificateNumber',
  BankingInfo: 'id corpId bankName branchAddress signingOfficers accountTypes',
  AnnualResolution: 'id corpId fiscalYearCovered financialStatementsApproved directorContinuation dividendDeclared dividendAmount dividendClass auditWaiver dateSigned pdfGenerated createdAt',
  AdHocResolution: 'id corpId type customTitle date details dateSigned pdfGenerated createdAt',
  DocumentRegistryEntry: 'id corpId documentId documentType periodCovered dateSigned pdfGenerated',
  Document: 'id corpId scope fiscalYear category title fileName s3Key contentType size uploadedBy attestationConfirmed attestationBy attestationAt createdAt',
  ShareholdersMeeting: 'id corpId fiscalYear meetingDate status notes dateSigned pdfGenerated createdAt',
  Officer: 'id corpId name office appointmentDate endDate',
  SignificantControlPerson: 'id corpId name address dateOfBirth controlType controlDescription controlStartDate controlEndDate',
  ShareTransfer: 'id corpId transferDate shareClassId fromHolder toHolder quantity consideration certificateIssued certificateCancelled notes',
};

// Explicit plurals for list queries — must match the field names in the
// AppSync schema (infra/generate-template.mjs), which uses proper English
// pluralization (ShareClass -> ShareClasses, not ShareClasss).
const PLURAL = {
  CorpInfo: 'CorpInfos',
  Director: 'Directors',
  ShareClass: 'ShareClasses',
  Shareholder: 'Shareholders',
  BankingInfo: 'BankingInfos',
  AnnualResolution: 'AnnualResolutions',
  AdHocResolution: 'AdHocResolutions',
  DocumentRegistryEntry: 'DocumentRegistryEntries',
  Document: 'Documents',
  ShareholdersMeeting: 'ShareholdersMeetings',
  Officer: 'Officers',
  SignificantControlPerson: 'SignificantControlPeople',
  ShareTransfer: 'ShareTransfers',
};

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      await ensureAmplifyConfigured();
      const { generateClient } = await import(API_ESM);
      return generateClient();
    })();
  }
  return clientPromise;
}

function listQuery(model) {
  // Corp-scoped lists require corpId (matches the AppSync schema); CorpInfo
  // lists all corporations.
  if (isScoped(model)) {
    return `query List${model}($corpId: ID!) { list${PLURAL[model]}(corpId: $corpId) { items { ${SELECTION[model]} } } }`;
  }
  return `query List${model} { list${PLURAL[model]} { items { ${SELECTION[model]} } } }`;
}
function getQuery(model) {
  return `query Get${model}($id: ID!) { get${model}(id: $id) { ${SELECTION[model]} } }`;
}
function createMutation(model) {
  return `mutation Create${model}($input: Create${model}Input!) { create${model}(input: $input) { ${SELECTION[model]} } }`;
}
function updateMutation(model) {
  return `mutation Update${model}($input: Update${model}Input!) { update${model}(input: $input) { ${SELECTION[model]} } }`;
}
function deleteMutation(model) {
  return `mutation Delete${model}($input: Delete${model}Input!) { delete${model}(input: $input) { id } }`;
}

async function run(query, variables) {
  const client = await getClient();
  const res = await client.graphql({ query, variables, authMode: 'userPool' });
  return res.data;
}

export const amplifyAdapter = {
  name: 'amplify',

  async list(model, corpId) {
    const data = await run(listQuery(model), isScoped(model) ? { corpId } : undefined);
    return data[`list${PLURAL[model]}`].items;
  },
  async get(model, id) {
    const data = await run(getQuery(model), { id });
    return data[`get${model}`];
  },
  async create(model, input) {
    const data = await run(createMutation(model), { input });
    return data[`create${model}`];
  },
  async update(model, input) {
    const data = await run(updateMutation(model), { input });
    return data[`update${model}`];
  },
  async remove(model, id) {
    const data = await run(deleteMutation(model), { input: { id } });
    return data[`delete${model}`];
  },
};
