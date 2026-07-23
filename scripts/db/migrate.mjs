// Apply scripts/db/schema.sql to the Neon database in DATABASE_URL.
// The schema is fully idempotent, so this is safe to re-run at any time:
//   DATABASE_URL=postgres://... node scripts/db/migrate.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set.");
  process.exit(1);
}

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");
const schema = await readFile(schemaPath, "utf8");

// The HTTP driver runs one statement per call — split on the blank-line-safe
// terminator. Statements contain no ';' in string literals, so this is safe.
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s && !s.split("\n").every((line) => line.trim().startsWith("--")));

const sql = neon(url);
for (const stmt of statements) {
  await sql.query(stmt);
}
console.log(`✓ Applied ${statements.length} statements from schema.sql`);
