import { sql } from './db';

export interface AuthorOption {
  id: string;
  name: string;
}

/** Bylines from the DB (seeded by scripts/db/schema.sql). */
export async function getAuthors(): Promise<AuthorOption[]> {
  const rows = (await sql()`SELECT id, name FROM authors ORDER BY sort, name`) as AuthorOption[];
  return rows;
}
