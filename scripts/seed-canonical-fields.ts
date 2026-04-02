import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { canonicalFields } from '../lib/db/schema';
import { CANONICAL_FIELDS } from '../lib/mapping/canonical-fields';

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED!);
  const db = drizzle(sql);

  console.log(`Seeding ${CANONICAL_FIELDS.length} canonical fields...`);

  // Upsert: delete existing then re-insert
  await db.delete(canonicalFields);

  for (const field of CANONICAL_FIELDS) {
    await db.insert(canonicalFields).values(field);
  }

  console.log(`Done. ${CANONICAL_FIELDS.length} canonical fields seeded.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
