// One-time backfill: assign a corpId to pre-multi-tenant (v1) records so they
// belong to a corporation (e.g. Spark-E) and show up in the byCorp GSI.
//
// Easiest to run in AWS CloudShell (it already has your credentials + Node):
//   npm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
//   node backfill-corpid.mjs [stackName] [corpId]
//
// - stackName defaults to "minutebook-backend".
// - corpId: the CorpInfo id these records belong to. If omitted and the
//   CorpInfo table has exactly one record, that record's id is used (i.e. treat
//   your existing single corp as Spark-E).
//
// Idempotent: records that already have a corpId are skipped, so it's safe to
// re-run.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const stackName = process.argv[2] || 'minutebook-backend';
let corpId = process.argv[3] || null;

// Every corp-scoped model (all except CorpInfo). Keep in sync with the
// generator's MODELS list.
const SCOPED = [
  'Director', 'ShareClass', 'Shareholder', 'BankingInfo', 'AnnualResolution',
  'AdHocResolution', 'DocumentRegistryEntry', 'Document', 'ShareholdersMeeting',
  'Officer', 'SignificantControlPerson', 'ShareTransfer',
];

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = (m) => `${stackName}-${m}`;

async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function resolveCorpId() {
  if (corpId) return corpId;
  const corps = await scanAll(table('CorpInfo'));
  if (corps.length === 1) return corps[0].id;
  const list = corps.map((c) => `${c.id} (${c.legalName || '?'})`).join(', ') || '(none)';
  throw new Error(`Pass the target corpId explicitly. CorpInfo has ${corps.length} records: ${list}`);
}

async function main() {
  corpId = await resolveCorpId();
  console.log(`Backfilling corpId=${corpId} on stack "${stackName}"\n`);
  for (const m of SCOPED) {
    const TableName = table(m);
    let updated = 0; let skipped = 0;
    let items;
    try {
      items = await scanAll(TableName);
    } catch (e) {
      console.log(`  ${m}: SKIP (${e.name || e.message})`);
      continue;
    }
    for (const it of items) {
      if (it.corpId) { skipped++; continue; }
      await ddb.send(new UpdateCommand({
        TableName,
        Key: { id: it.id },
        UpdateExpression: 'SET corpId = :c',
        ExpressionAttributeValues: { ':c': corpId },
      }));
      updated++;
    }
    console.log(`  ${m}: ${updated} updated, ${skipped} already had corpId`);
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
