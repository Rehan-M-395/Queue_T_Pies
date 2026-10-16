import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured in backend/.env')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const migrationPath = fileURLToPath(new URL('./migrations/001_create_resumes.sql', import.meta.url))

try {
  const migration = await readFile(migrationPath, 'utf8')
  await pool.query(migration)
  console.log('Resume metadata migration completed.')
} finally {
  await pool.end()
}
