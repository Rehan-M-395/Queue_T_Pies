import 'dotenv/config'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import pg from 'pg'

const { Pool } = pg
const app = express()
const port = Number(process.env.PORT || 4000)
const jwtSecret = process.env.JWT_SECRET
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const cookieName = 'queue_session'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured in backend/.env')
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')

const configuredTable = process.env.USERS_TABLE || 'public.users'
if (!/^[a-zA-Z_][\w$]*(\.[a-zA-Z_][\w$]*)?$/.test(configuredTable)) {
  throw new Error('USERS_TABLE must be a simple table or schema.table identifier')
}
const usersTable = configuredTable.split('.').map((part) => `"${part}"`).join('.')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

app.use(cors({ origin: frontendOrigin, credentials: true }))
app.use(express.json({ limit: '20kb' }))
app.use(cookieParser())

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin')
  if (origin && origin !== frontendOrigin) return res.status(403).json({ error: 'Request origin is not allowed.' })
  return next()
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role }
}

function createSession(res, row) {
  const token = jwt.sign({ sub: row.id, role: row.role }, jwtSecret, { expiresIn: '7d', issuer: 'queue-t-pies' })
  res.cookie(cookieName, token, cookieOptions)
}

async function findUserByEmail(email) {
  const result = await pool.query(`SELECT id, name, email, password_hash, role FROM ${usersTable} WHERE lower(email) = lower($1) LIMIT 1`, [email])
  return result.rows[0]
}

function getToken(req) {
  const authorization = req.get('authorization')
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7)
  return req.cookies[cookieName]
}

async function requireSession(req, res, next) {
  const token = getToken(req)
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' })
  try {
    const payload = jwt.verify(token, jwtSecret, { issuer: 'queue-t-pies' })
    const result = await pool.query(`SELECT id, name, email, role FROM ${usersTable} WHERE id = $1 LIMIT 1`, [payload.sub])
    if (!result.rows[0]) return res.status(401).json({ error: 'This session is no longer valid.' })
    req.user = result.rows[0]
    return next()
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/signup', requireTrustedOrigin, authLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be between 8 and 72 characters.' })

    const role = 'user'
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await pool.query(
      `INSERT INTO ${usersTable} (id, name, email, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, email, role`,
      [randomUUID(), name, email, passwordHash, role],
    )
    const user = result.rows[0]
    createSession(res, user)
    return res.status(201).json({ user: publicUser(user) })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' })
    return next(error)
  }
})

app.post('/api/auth/login', requireTrustedOrigin, authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    const portal = req.body.portal === 'admin' ? 'admin' : 'user'
    if (!email || !password) return res.status(400).json({ error: 'Enter your email address and password.' })

    const row = await findUserByEmail(email)
    let validPassword = false
    if (row?.password_hash) {
      if (/^\$2[aby]\$/.test(row.password_hash)) {
        validPassword = await bcrypt.compare(password, row.password_hash)
      } else {
        // Upgrade the provided sample's legacy plaintext password after its first successful login.
        const stored = Buffer.from(row.password_hash)
        const supplied = Buffer.from(password)
        validPassword = stored.length === supplied.length && timingSafeEqual(stored, supplied)
        if (validPassword) {
          const upgradedHash = await bcrypt.hash(password, 12)
          await pool.query(`UPDATE ${usersTable} SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [upgradedHash, row.id])
        }
      }
    }
    if (!row || !validPassword) return res.status(401).json({ error: 'Email or password is incorrect.' })

    const roles = portal === 'admin' ? ['admin', 'hr'] : ['user', 'employer']
    if (!roles.includes(String(row.role).toLowerCase())) {
      return res.status(403).json({ error: portal === 'admin' ? 'This account does not have Admin / HR access.' : 'Use the Admin / HR sign-in for this account.' })
    }
    createSession(res, row)
    return res.json({ user: publicUser(row) })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/auth/me', requireSession, (req, res) => res.json({ user: publicUser(req.user) }))

app.post('/api/auth/logout', requireTrustedOrigin, (_req, res) => {
  res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined })
  return res.json({ ok: true })
})

app.use((error, _req, res, _next) => {
  console.error('API request failed:', error.message)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(port, () => console.log(`Queue_T_pies API listening on port ${port}`))
