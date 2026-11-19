// Uses temporary tables in a rolled-back transaction; never migrates application tables.
require('dotenv/config');
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const connectionString = process.env.FAQ_TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set FAQ_TEST_DATABASE_URL or DATABASE_URL');
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE "Product" ("id" INTEGER PRIMARY KEY)');
    await client.query('SET LOCAL search_path TO pg_temp');
    await client.query(readFileSync(join(__dirname, '../prisma/migrations/20261119000000_add_faq/migration.sql'), 'utf8'));
    await client.query('INSERT INTO "Product" ("id") VALUES (1)');
    await client.query(`INSERT INTO "Faq" ("question", "answer", "productId", "updatedAt") VALUES ('Product?', 'Answer', 1, NOW()), ('Website?', 'Answer', NULL, NOW())`);
    const defaults = await client.query('SELECT "sortOrder", "isActive" FROM "Faq" ORDER BY "id"');
    assert.deepEqual(defaults.rows, [{ sortOrder: 0, isActive: true }, { sortOrder: 0, isActive: true }]);
    await client.query('SAVEPOINT invalid_product');
    await assert.rejects(client.query(`INSERT INTO "Faq" ("question", "answer", "productId", "updatedAt") VALUES ('Invalid?', 'Answer', 999, NOW())`), { code: '23503' });
    await client.query('ROLLBACK TO SAVEPOINT invalid_product');
    await client.query('DELETE FROM "Product" WHERE "id" = 1');
    const remaining = await client.query('SELECT "productId" FROM "Faq"');
    assert.deepEqual(remaining.rows, [{ productId: null }]);
    console.log('FAQ migration passed: defaults, foreign key, cascade, website FAQ preserved.');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch((error) => {
  console.error('FAQ migration verification failed (' + (error.code || error.name) + ').');
  process.exitCode = 1;
});
