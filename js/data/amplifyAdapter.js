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

const API_ESM = 'https://esm.sh/aws-amplify@6/api';

// Minimal generic GraphQL documents. The Amplify CLI generates fully-typed
// queries in src/graphql, but for a vanilla no-build app we hand-write the
// operations we need. Field selection is intentionally "*"-ish per model.
const SELECTION = {
  CorpInfo: 'id legalName tradeNames corporationNumber businessNumber jurisdiction incorporationDate registeredOffice mailingAddress updatedAt',
  Director: 'id name address titles appointmentDate isSoleDirector',
  ShareClass: 'id className authorized issued rightsRestrictions',
  Shareholder: 'id name shareClassId quantity certificateNumber',
  BankingInfo: 'id bankName branchAddress signingOfficers accountTypes',
  AnnualResolution: 'id fiscalYearCovered financialStatementsApproved directorContinuation dividendDeclared dividendAmount dividendClass auditWaiver dateSigned pdfGenerated createdAt',
  AdHocResolution: 'id type customTitle date details dateSigned pdfGenerated createdAt',
  DocumentRegistryEntry: 'id documentId documentType periodCovered dateSigned pdfGenerated',
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
  return `query List${model} { list${model}s { items { ${SELECTION[model]} } } }`;
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

  async list(model) {
    const data = await run(listQuery(model));
    return data[`list${model}s`].items;
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
