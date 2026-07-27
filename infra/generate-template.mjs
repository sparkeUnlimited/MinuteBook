// Generates the CloudFormation template that provisions the Minute Book
// AppSync + DynamoDB backend, wired to the EXISTING Cognito user pool.
//
//   node infra/generate-template.mjs
//     -> writes infra/minutebook-appsync.json
//
// Design:
//   - One DynamoDB table per model (PK = id, on-demand billing).
//   - One AppSync API with Cognito user-pool auth (any signed-in pool user can
//     read/write — single-user tool, no per-owner isolation; see infra/README).
//   - Generic APPSYNC_JS resolvers for get/list/create/update/delete, reused
//     across every model (identical code, different data source).
//
// Regenerate and commit the JSON whenever the model list changes.

import { writeFileSync } from 'node:fs';

// Field types mirror schema/schema.graphql. `createdAt` / `updatedAt` are
// server-managed (set by resolvers) and excluded from input types.
const MODELS = {
  CorpInfo: {
    plural: 'CorpInfos',
    fields: {
      legalName: 'String', tradeNames: '[String]', corporationNumber: 'String',
      businessNumber: 'String', jurisdiction: 'String', incorporationDate: 'AWSDate',
      registeredOffice: 'String', mailingAddress: 'String',
    },
  },
  Director: {
    plural: 'Directors',
    fields: {
      name: 'String', address: 'String', titles: '[String]',
      appointmentDate: 'AWSDate', isSoleDirector: 'Boolean',
    },
  },
  ShareClass: {
    plural: 'ShareClasses',
    fields: {
      className: 'String', authorized: 'Int', issued: 'Int', rightsRestrictions: 'String',
    },
  },
  Shareholder: {
    plural: 'Shareholders',
    fields: {
      name: 'String', shareClassId: 'ID', quantity: 'Int', certificateNumber: 'String',
    },
  },
  BankingInfo: {
    plural: 'BankingInfos',
    fields: {
      bankName: 'String', branchAddress: 'String',
      signingOfficers: '[String]', accountTypes: '[String]',
    },
  },
  AnnualResolution: {
    plural: 'AnnualResolutions',
    fields: {
      fiscalYearCovered: 'String', financialStatementsApproved: 'Boolean',
      directorContinuation: 'Boolean', dividendDeclared: 'Boolean',
      dividendAmount: 'Float', dividendClass: 'String', auditWaiver: 'Boolean',
      dateSigned: 'AWSDate', pdfGenerated: 'Boolean',
    },
  },
  AdHocResolution: {
    plural: 'AdHocResolutions',
    fields: {
      type: 'String', customTitle: 'String', date: 'AWSDate', details: 'String',
      dateSigned: 'AWSDate', pdfGenerated: 'Boolean',
    },
  },
  DocumentRegistryEntry: {
    plural: 'DocumentRegistryEntries',
    fields: {
      documentId: 'ID', documentType: 'String', periodCovered: 'String',
      dateSigned: 'AWSDate', pdfGenerated: 'Boolean',
    },
  },
};

// --- GraphQL SDL -----------------------------------------------------------

function typeBlock(model, def) {
  const lines = [`type ${model} {`, '  id: ID!'];
  for (const [name, t] of Object.entries(def.fields)) lines.push(`  ${name}: ${t}`);
  lines.push('  createdAt: AWSDateTime', '  updatedAt: AWSDateTime', '}');
  lines.push(`type ${model}Connection {`, `  items: [${model}!]!`, '  nextToken: String', '}');
  const inputFields = Object.entries(def.fields).map(([n, t]) => `  ${n}: ${t}`).join('\n');
  lines.push(`input Create${model}Input {`, '  id: ID', inputFields, '}');
  lines.push(`input Update${model}Input {`, '  id: ID!', inputFields, '}');
  lines.push(`input Delete${model}Input {`, '  id: ID!', '}');
  return lines.join('\n');
}

function buildSchemaSDL() {
  const types = Object.entries(MODELS).map(([m, d]) => typeBlock(m, d)).join('\n\n');
  const queries = Object.entries(MODELS).map(([m, d]) =>
    `  get${m}(id: ID!): ${m}\n  list${d.plural}(limit: Int, nextToken: String): ${m}Connection`).join('\n');
  const mutations = Object.entries(MODELS).map(([m]) =>
    `  create${m}(input: Create${m}Input!): ${m}\n  update${m}(input: Update${m}Input!): ${m}\n  delete${m}(input: Delete${m}Input!): ${m}`).join('\n');
  return `${types}\n\ntype Query {\n${queries}\n}\n\ntype Mutation {\n${mutations}\n}\n\nschema {\n  query: Query\n  mutation: Mutation\n}\n`;
}

// --- Resolver code (generic APPSYNC_JS, reused per model) -------------------

const CODE = {
  get: `import { util } from '@aws-appsync/utils';
export function request(ctx) {
  return { operation: 'GetItem', key: util.dynamodb.toMapValues({ id: ctx.args.id }) };
}
export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`,
  list: `import { util } from '@aws-appsync/utils';
export function request(ctx) {
  return { operation: 'Scan', limit: ctx.args.limit || 1000, nextToken: ctx.args.nextToken };
}
export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return { items: ctx.result.items, nextToken: ctx.result.nextToken };
}
`,
  create: `import { util } from '@aws-appsync/utils';
export function request(ctx) {
  const input = ctx.args.input;
  const id = input.id || util.autoId();
  const now = util.time.nowISO8601();
  const item = { createdAt: now, ...input, id, updatedAt: now };
  return {
    operation: 'PutItem',
    key: util.dynamodb.toMapValues({ id }),
    attributeValues: util.dynamodb.toMapValues(item),
    condition: { expression: 'attribute_not_exists(id)' },
  };
}
export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`,
  update: `import { util } from '@aws-appsync/utils';
export function request(ctx) {
  const input = ctx.args.input;
  const id = input.id;
  const names = {};
  const values = {};
  const sets = [];
  const keys = Object.keys(input);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === 'id') { continue; }
    names['#f' + i] = k;
    values[':v' + i] = input[k];
    sets.push('#f' + i + ' = :v' + i);
  }
  names['#u'] = 'updatedAt';
  values[':u'] = util.time.nowISO8601();
  sets.push('#u = :u');
  return {
    operation: 'UpdateItem',
    key: util.dynamodb.toMapValues({ id }),
    update: {
      expression: 'SET ' + sets.join(', '),
      expressionNames: names,
      expressionValues: util.dynamodb.toMapValues(values),
    },
  };
}
export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`,
  del: `import { util } from '@aws-appsync/utils';
export function request(ctx) {
  return { operation: 'DeleteItem', key: util.dynamodb.toMapValues({ id: ctx.args.input.id }) };
}
export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
}
`,
};

// --- CloudFormation resources ----------------------------------------------

const resources = {};
const GJS = { Name: 'APPSYNC_JS', RuntimeVersion: '1.0.0' };

resources.GraphQLApi = {
  Type: 'AWS::AppSync::GraphQLApi',
  Properties: {
    Name: { 'Fn::Sub': '${AWS::StackName}-api' },
    AuthenticationType: 'AMAZON_COGNITO_USER_POOLS',
    UserPoolConfig: {
      UserPoolId: { Ref: 'UserPoolId' },
      AwsRegion: { Ref: 'CognitoRegion' },
      DefaultAction: 'ALLOW',
    },
  },
};

resources.GraphQLSchema = {
  Type: 'AWS::AppSync::GraphQLSchema',
  Properties: {
    ApiId: { 'Fn::GetAtt': ['GraphQLApi', 'ApiId'] },
    Definition: buildSchemaSDL(),
  },
};

// IAM role AppSync assumes to reach the tables.
const tableArns = Object.keys(MODELS).map((m) => ({ 'Fn::GetAtt': [`${m}Table`, 'Arn'] }));
resources.AppSyncDynamoRole = {
  Type: 'AWS::IAM::Role',
  Properties: {
    AssumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'appsync.amazonaws.com' },
        Action: 'sts:AssumeRole',
      }],
    },
    Policies: [{
      PolicyName: 'ddb-access',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: [
            'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
            'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:Scan',
          ],
          Resource: tableArns,
        }],
      },
    }],
  },
};

const OPS = [
  { key: 'get', type: 'Query', field: (m, d) => `get${m}`, code: CODE.get },
  { key: 'list', type: 'Query', field: (m, d) => `list${d.plural}`, code: CODE.list },
  { key: 'create', type: 'Mutation', field: (m) => `create${m}`, code: CODE.create },
  { key: 'update', type: 'Mutation', field: (m) => `update${m}`, code: CODE.update },
  { key: 'del', type: 'Mutation', field: (m) => `delete${m}`, code: CODE.del },
];

for (const [model, def] of Object.entries(MODELS)) {
  resources[`${model}Table`] = {
    Type: 'AWS::DynamoDB::Table',
    Properties: {
      TableName: { 'Fn::Sub': `\${AWS::StackName}-${model}` },
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    },
  };

  resources[`${model}DataSource`] = {
    Type: 'AWS::AppSync::DataSource',
    Properties: {
      ApiId: { 'Fn::GetAtt': ['GraphQLApi', 'ApiId'] },
      Name: `${model}`,
      Type: 'AMAZON_DYNAMODB',
      ServiceRoleArn: { 'Fn::GetAtt': ['AppSyncDynamoRole', 'Arn'] },
      DynamoDBConfig: {
        AwsRegion: { Ref: 'AWS::Region' },
        TableName: { Ref: `${model}Table` },
      },
    },
  };

  for (const op of OPS) {
    resources[`${model}${op.key}Resolver`] = {
      Type: 'AWS::AppSync::Resolver',
      DependsOn: 'GraphQLSchema',
      Properties: {
        ApiId: { 'Fn::GetAtt': ['GraphQLApi', 'ApiId'] },
        TypeName: op.type,
        FieldName: op.field(model, def),
        DataSourceName: { 'Fn::GetAtt': [`${model}DataSource`, 'Name'] },
        Runtime: GJS,
        Code: op.code,
      },
    };
  }
}

const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Minute Book — AppSync + DynamoDB backend (Cognito user-pool auth).',
  Parameters: {
    UserPoolId: {
      Type: 'String',
      Default: 'us-east-1_iQ2q3z7ep',
      Description: 'Existing Cognito user pool id to authorize the API.',
    },
    CognitoRegion: {
      Type: 'String',
      Default: 'us-east-1',
      Description: 'Region of the Cognito user pool.',
    },
  },
  Resources: resources,
  Outputs: {
    GraphQLApiUrl: {
      Description: 'AppSync GraphQL endpoint — put this in MB_APPSYNC_ENDPOINT / config.appsync.endpoint.',
      Value: { 'Fn::GetAtt': ['GraphQLApi', 'GraphQLUrl'] },
    },
    GraphQLApiId: {
      Description: 'AppSync API id.',
      Value: { 'Fn::GetAtt': ['GraphQLApi', 'ApiId'] },
    },
    Region: {
      Description: 'Region the API is deployed in (for config.appsync.region).',
      Value: { Ref: 'AWS::Region' },
    },
  },
};

const out = new URL('./minutebook-appsync.json', import.meta.url);
writeFileSync(out, JSON.stringify(template, null, 2) + '\n');

const resourceCount = Object.keys(resources).length;
console.log(`[generate-template] wrote infra/minutebook-appsync.json`);
console.log(`  models: ${Object.keys(MODELS).length}, resources: ${resourceCount} (tables + data sources + ${Object.keys(MODELS).length * OPS.length} resolvers + api/schema/role)`);
