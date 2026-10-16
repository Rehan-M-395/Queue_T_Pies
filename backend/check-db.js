import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
const databaseUrl = process.env.DATABASE_URL
const configuredTable = process.env.USERS_TABLE || 'public.users'
const requiredColumns = ['id', 'name', 'email', 'password_hash', 'role', 'created_at', 'updated_at']

if (!databaseUrl) throw new Error('DATABASE_URL is missing in backend/.env')
if (!/^[a-zA-Z_][\w$]*(\.[a-zA-Z_][\w$]*)?$/.test(configuredTable)) {
  throw new Error('USERS_TABLE must be a simple table or schema.table identifier')
}

const [schema = 'public', table = schema] = configuredTable.includes('.')
  ? configuredTable.split('.')
  : ['public', configuredTable]
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

try {
  await pool.query('SELECT 1')
  const result = await pool.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
    [schema, table],
  )
  const columns = new Set(result.rows.map((row) => row.column_name))
  if (columns.size === 0) throw new Error(`Connected, but table ${schema}.${table} was not found`)
  const missing = requiredColumns.filter((column) => !columns.has(column))
  if (missing.length) throw new Error(`Table ${schema}.${table} is missing columns: ${missing.join(', ')}`)
  console.log(`Neon connection successful. ${schema}.${table} has all expected columns.`)
} finally {
  await pool.end()
}
