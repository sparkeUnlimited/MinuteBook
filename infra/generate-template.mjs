// Generates the CloudFormation template that provisions the Minute Book
// AppSync + DynamoDB backend, wired to the EXISTING Cognito user pool.
//
//   node infra/generate-template.mjs
//     -> writes infra/minutebook-appsync.json
//
// Design:
//   - One DynamoDB table per model (PK = id, on-demand billing).
//   - One AppSync API with Cognito user-pool auth. Reads are open to any
//     authenticated user; writes are gated by Cognito group via @aws_auth
//     (minute book = Owners only; FinancialDocument = Owners + Accountants).
//   - Generic APPSYNC_JS resolvers for get/list/create/update/delete, reused
//     across every model (identical code, different data source).
//   - Cognito groups (Owners, Accountants), an S3 bucket for financial files
//     (folder per year), and a Cognito Identity Pool so the browser can
//     upload/download to S3 with temporary, prefix-scoped credentials.
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
  // Financial documents uploaded by the accountant (or owner). Metadata only —
  // the file itself lives in S3 (see FinancialsBucket). Both Owners and
  // Accountants may write these; everything else is Owners-only.
  FinancialDocument: {
    plural: 'FinancialDocuments',
    writeGroups: ['Owners', 'Accountants'],
    fields: {
      fiscalYear: 'String', category: 'String', fileName: 'String',
      s3Key: 'String', contentType: 'String', size: 'Int', uploadedBy: 'String',
    },
  },
};

// Which Cognito groups may create/update/delete a model. Reads are open to any
// authenticated user (the accountant sees the whole minute book, read-only).
const DEFAULT_WRITE_GROUPS = ['Owners'];

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
  const mutations = Object.entries(MODELS).map(([m, d]) => {
    const groups = (d.writeGroups || DEFAULT_WRITE_GROUPS).map((g) => `"${g}"`).join(', ');
    const a = ` @aws_auth(cognito_groups: [${groups}])`;
    return `  create${m}(input: Create${m}Input!): ${m}${a}\n  update${m}(input: Update${m}Input!): ${m}${a}\n  delete${m}(input: Delete${m}Input!): ${m}${a}`;
  }).join('\n');
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
  Object.keys(input).forEach((k) => {
    if (k !== 'id') {
      const nk = '#f' + sets.length;
      const vk = ':v' + sets.length;
      names[nk] = k;
      values[vk] = input[k];
      sets.push(nk + ' = ' + vk);
    }
  });
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = util.time.nowISO8601();
  sets.push('#updatedAt = :updatedAt');
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

// --- Cognito groups (roles) ------------------------------------------------
// Added to the EXISTING user pool. Owners = full access; Accountants =
// read-only minute book + manage financial documents. You add users to these
// groups in the Cognito console.
resources.OwnersGroup = {
  Type: 'AWS::Cognito::UserPoolGroup',
  Properties: {
    GroupName: 'Owners',
    UserPoolId: { Ref: 'UserPoolId' },
    Description: 'Full read/write access to the minute book.',
    Precedence: 1,
  },
};
resources.AccountantsGroup = {
  Type: 'AWS::Cognito::UserPoolGroup',
  Properties: {
    GroupName: 'Accountants',
    UserPoolId: { Ref: 'UserPoolId' },
    Description: 'Read-only on the minute book; can manage financial documents.',
    Precedence: 10,
  },
};

// --- S3 bucket for financial files (folder per year: financials/{year}/) ----
resources.FinancialsBucket = {
  Type: 'AWS::S3::Bucket',
  Properties: {
    BucketName: { 'Fn::Sub': '${AWS::StackName}-financials-${AWS::AccountId}' },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
      ],
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true, BlockPublicPolicy: true,
      IgnorePublicAcls: true, RestrictPublicBuckets: true,
    },
    OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
    // Browser uploads/downloads need CORS. Access is gated by Cognito/IAM
    // (SigV4-signed requests), so origin is not the security boundary.
    CorsConfiguration: {
      CorsRules: [{
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
        AllowedOrigins: ['*'],
        ExposedHeaders: ['ETag', 'x-amz-server-side-encryption', 'x-amz-request-id', 'x-amz-id-2'],
        MaxAge: 3000,
      }],
    },
  },
};

// --- Cognito Identity Pool: exchanges a signed-in user-pool token for
//     temporary AWS creds scoped to the financials/ prefix, so the browser can
//     upload/download directly to S3 (via the Amplify Storage library). --------
resources.FinancialsIdentityPool = {
  Type: 'AWS::Cognito::IdentityPool',
  Properties: {
    IdentityPoolName: { 'Fn::Sub': '${AWS::StackName}_identitypool' },
    AllowUnauthenticatedIdentities: false,
    CognitoIdentityProviders: [{
      ProviderName: { 'Fn::Sub': 'cognito-idp.${CognitoRegion}.amazonaws.com/${UserPoolId}' },
      ClientId: { Ref: 'UserPoolClientId' },
      ServerSideTokenCheck: false,
    }],
  },
};

resources.FinancialsAuthRole = {
  Type: 'AWS::IAM::Role',
  Properties: {
    AssumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Federated: 'cognito-identity.amazonaws.com' },
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': { Ref: 'FinancialsIdentityPool' } },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
      }],
    },
    Policies: [{
      PolicyName: 'financials-s3',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
            Resource: { 'Fn::Sub': '${FinancialsBucket.Arn}/financials/*' },
          },
          {
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: { 'Fn::GetAtt': ['FinancialsBucket', 'Arn'] },
            Condition: { StringLike: { 's3:prefix': ['financials/*'] } },
          },
        ],
      },
    }],
  },
};

resources.FinancialsIdentityPoolRoleAttachment = {
  Type: 'AWS::Cognito::IdentityPoolRoleAttachment',
  Properties: {
    IdentityPoolId: { Ref: 'FinancialsIdentityPool' },
    Roles: { authenticated: { 'Fn::GetAtt': ['FinancialsAuthRole', 'Arn'] } },
  },
};

const template = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Minute Book — AppSync + DynamoDB + S3 backend with Cognito group roles (Owners / Accountants).',
  Parameters: {
    UserPoolId: {
      Type: 'String',
      Default: 'us-east-1_iQ2q3z7ep',
      Description: 'Existing Cognito user pool id to authorize the API.',
    },
    UserPoolClientId: {
      Type: 'String',
      Default: '6sdk3tr7ou04ggjv0pdvclq36i',
      Description: 'Existing user-pool app client id (public web client), for the Identity Pool.',
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
    FinancialsBucketName: {
      Description: 'S3 bucket for financial files — set as MB_S3_BUCKET.',
      Value: { Ref: 'FinancialsBucket' },
    },
    IdentityPoolId: {
      Description: 'Cognito Identity Pool id — set as MB_IDENTITY_POOL_ID.',
      Value: { Ref: 'FinancialsIdentityPool' },
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
console.log(`  models: ${Object.keys(MODELS).length}, resolvers: ${Object.keys(MODELS).length * OPS.length}, total resources: ${resourceCount}`);
console.log(`  added: Owners/Accountants groups, S3 bucket, Cognito Identity Pool + auth role`);
