import 'dotenv/config'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured in backend/.env')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const migrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  const migrations = (await readdir(migrationsDirectory)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort()
  for (const name of migrations) {
    const existing = await pool.query('SELECT 1 FROM public.schema_migrations WHERE name=$1', [name])
    if (existing.rowCount) continue
    const migration = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(migration)
      await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
      console.log(`Applied database migration ${name}.`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
} finally {
  await pool.end()
}
