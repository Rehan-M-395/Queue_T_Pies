import dotenv from 'dotenv'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '.env') })

const { Pool } = pg
const app = express()
// Render's proxy forwards the client IP in X-Forwarded-For. Trust its single
// proxy hop so express-rate-limit can identify clients correctly.
app.set('trust proxy', 1)
const port = Number(process.env.PORT || 4000)
const jwtSecret = process.env.JWT_SECRET
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const cookieName = 'queue_session'
const resumeBucket = 'resumes'
const maxResumeBytes = 10 * 1024 * 1024
const acceptedResumeTypes = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured in backend/.env')
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')

const configuredTable = process.env.USERS_TABLE || 'public.users'
if (!/^[a-zA-Z_][\w$]*(\.[a-zA-Z_][\w$]*)?$/.test(configuredTable)) {
  throw new Error('USERS_TABLE must be a simple table or schema.table identifier')
}
const usersTable = configuredTable.split('.').map((part) => `"${part}"`).join('.')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null
let resumeBucketReady = false
const indianApiKey = process.env.INDIANAPI_API_KEY
const indianApiCacheTtlMs = 5 * 60 * 1000
let indianApiCache

app.use(cors({ origin: frontendOrigin, credentials: true }))
app.use((req, res, next) => {
  const parser = req.path === '/api/github/webhook' && req.method === 'POST'
    ? express.raw({ type: 'application/json', limit: '2mb' })
    : express.json({ limit: '20kb' })
  parser(req, res, next)
})
app.use(cookieParser())

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
const aiChatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })
function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin')
  if (origin && origin !== frontendOrigin) return res.status(403).json({ error: 'Request origin is not allowed.' })
  return next()
}

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxResumeBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase()
    const expectedType = acceptedResumeTypes[extension]
    const suppliedType = file.mimetype.toLowerCase()
    if (!expectedType || (suppliedType && suppliedType !== expectedType && suppliedType !== 'application/octet-stream')) {
      return callback(new Error('Upload a PDF or DOCX resume.'))
    }
    return callback(null, true)
  },
})

function requireResumeStorage(_req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Resume storage is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to backend/.env.' })
  if (!resumeBucketReady) return res.status(503).json({ error: 'Resume storage is not ready. Check the backend storage configuration.' })
  return next()
}

async function ensurePrivateResumeBucket() {
  const bucketOptions = {
    public: false,
    fileSizeLimit: maxResumeBytes,
    allowedMimeTypes: Object.values(acceptedResumeTypes),
  }
  const existing = await supabase.storage.getBucket(resumeBucket)
  let bucket = existing.data
  if (existing.error) {
    const created = await supabase.storage.createBucket(resumeBucket, bucketOptions)
    if (created.error) {
      const afterCreate = await supabase.storage.getBucket(resumeBucket)
      if (afterCreate.error) throw created.error
      bucket = afterCreate.data
    } else {
      bucket = created.data
    }
  }
  if (bucket) {
    const updated = await supabase.storage.updateBucket(resumeBucket, bucketOptions)
    if (updated.error) throw updated.error
  }
  resumeBucketReady = true
}

function isAllowedResumeContent(file) {
  const extension = extname(file.originalname).toLowerCase()
  const expectedType = acceptedResumeTypes[extension]
  if (!expectedType || (file.mimetype && file.mimetype !== expectedType && file.mimetype !== 'application/octet-stream')) return false
  if (extension === '.pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-'
  return file.buffer.length >= 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04
}

function resumeDto(row) {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
  }
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

function githubEncryptionKey() {
  const configured = process.env.GITHUB_TOKEN_ENCRYPTION_KEY || ''
  const key = /^[\da-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64')
  if (key.length !== 32) throw new Error('GitHub token encryption is not configured.')
  return key
}

app.get('/api/health', (_req, res) => {
  const tokenEncryptionKeyPresent = Boolean(process.env.GITHUB_TOKEN_ENCRYPTION_KEY)
  let tokenEncryptionKeyValid = false
  if (tokenEncryptionKeyPresent) {
    try {
      githubEncryptionKey()
      tokenEncryptionKeyValid = true
    } catch {
      // Health checks expose configuration status only, never credential values.
    }
  }

  return res.json({
    ok: true,
    resumeStorageConfigured: Boolean(supabase),
    resumeBucketReady,
    githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_TOKEN_ENCRYPTION_KEY),
    githubConfig: {
      clientIdPresent: Boolean(process.env.GITHUB_CLIENT_ID),
      clientSecretPresent: Boolean(process.env.GITHUB_CLIENT_SECRET),
      tokenEncryptionKeyPresent,
      tokenEncryptionKeyValid,
      callbackUrlPresent: Boolean(process.env.GITHUB_CALLBACK_URL),
    },
  })
})

function encryptGitHubTokens(tokens, userId, githubUserId) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', githubEncryptionKey(), iv)
  cipher.setAAD(Buffer.from(`${userId}:${githubUserId}`))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()])
  return { ciphertext, iv, authTag: cipher.getAuthTag() }
}

function decryptGitHubTokens(row) {
  const decipher = createDecipheriv('aes-256-gcm', githubEncryptionKey(), row.token_iv)
  decipher.setAAD(Buffer.from(`${row.user_id}:${row.github_user_id}`))
  decipher.setAuthTag(row.token_auth_tag)
  return JSON.parse(Buffer.concat([decipher.update(row.token_ciphertext), decipher.final()]).toString('utf8'))
}

function githubConfigured(res) {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !process.env.GITHUB_CALLBACK_URL) {
    res.status(503).json({ error: 'GitHub OAuth is not configured on the server.' })
    return false
  }
  return true
}

app.post('/api/github/oauth/start', requireTrustedOrigin, requireSession, async (req, res, next) => {
  try {
    if (!githubConfigured(res)) return
    githubEncryptionKey()
    const rawState = randomBytes(32).toString('base64url')
    const stateHash = createHash('sha256').update(rawState).digest('hex')
    await pool.query('DELETE FROM public.github_oauth_states WHERE expires_at <= NOW()')
    await pool.query('INSERT INTO public.github_oauth_states (state_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')', [stateHash, req.user.id])
    const authorize = new URL('https://github.com/login/oauth/authorize')
    authorize.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID)
    authorize.searchParams.set('redirect_uri', process.env.GITHUB_CALLBACK_URL)
    authorize.searchParams.set('state', rawState)
    authorize.searchParams.set('allow_signup', 'true')
    return res.json({ authorizationUrl: authorize.toString() })
  } catch (error) { return next(error) }
})

app.get('/api/github/callback', async (req, res) => {
  const redirect = new URL('/dashboard', frontendOrigin)
  const fail = (code) => { redirect.searchParams.set('github', code); return res.redirect(302, redirect.toString()) }
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !process.env.GITHUB_CALLBACK_URL) return fail('not_configured')
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  if (!state || state.length > 200 || !code || code.length > 300) return fail('invalid_state')
  try {
    const stateHash = createHash('sha256').update(state).digest('hex')
    const consumed = await pool.query('DELETE FROM public.github_oauth_states WHERE state_hash = $1 AND expires_at > NOW() RETURNING user_id', [stateHash])
    const userId = consumed.rows[0]?.user_id
    if (!userId) return fail('invalid_state')
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: process.env.GITHUB_CALLBACK_URL }),
      signal: AbortSignal.timeout(12000),
    })
    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok || !tokenData.access_token) return fail('token_exchange_failed')
    const profileResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(12000),
    })
    const profile = await profileResponse.json()
    if (!profileResponse.ok || !profile.id || !profile.login) return fail('profile_failed')
    const githubUserId = String(profile.id)
    const existingLink = await pool.query(
      'SELECT user_id FROM public.github_connections WHERE github_user_id=$1 AND user_id<>$2 LIMIT 1',
      [githubUserId, userId],
    )
    if (existingLink.rowCount) return fail('github_already_linked')
    const encrypted = encryptGitHubTokens({ accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token || null }, userId, githubUserId)
    await pool.query(`INSERT INTO public.github_connections
      (user_id, github_user_id, github_login, token_ciphertext, token_iv, token_auth_tag, token_expires_at, refresh_token_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::bigint IS NULL THEN NULL ELSE NOW() + ($7::text || ' seconds')::interval END,
        CASE WHEN $8::bigint IS NULL THEN NULL ELSE NOW() + ($8::text || ' seconds')::interval END)
      ON CONFLICT (user_id) DO UPDATE SET github_user_id = EXCLUDED.github_user_id, github_login = EXCLUDED.github_login,
        token_ciphertext = EXCLUDED.token_ciphertext, token_iv = EXCLUDED.token_iv, token_auth_tag = EXCLUDED.token_auth_tag,
        token_expires_at = EXCLUDED.token_expires_at, refresh_token_expires_at = EXCLUDED.refresh_token_expires_at, updated_at = NOW()`,
    [userId, githubUserId, profile.login, encrypted.ciphertext, encrypted.iv, encrypted.authTag, tokenData.expires_in || null, tokenData.refresh_token_expires_in || null])
    redirect.searchParams.set('github', 'connected')
    return res.redirect(302, redirect.toString())
  } catch (error) {
    if (error.code === '23505') return fail('github_already_linked')
    console.error('GitHub OAuth callback failed:', error.message)
    return fail('callback_failed')
  }
})

async function getGitHubAccessToken(userId) {
  const result = await pool.query('SELECT * FROM public.github_connections WHERE user_id = $1 LIMIT 1', [userId])
  const row = result.rows[0]
  if (!row) return null
  let tokens
  try { tokens = decryptGitHubTokens(row) } catch { throw new Error('GitHub connection could not be decrypted. Reconnect GitHub.') }
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
    if (!tokens.refreshToken || (row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() <= Date.now())) throw new Error('GitHub session expired. Reconnect GitHub.')
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: tokens.refreshToken }),
      signal: AbortSignal.timeout(12000),
    })
    const refreshed = await response.json()
    if (!response.ok || !refreshed.access_token) throw new Error('GitHub session expired. Reconnect GitHub.')
    tokens = { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || tokens.refreshToken }
    const encrypted = encryptGitHubTokens(tokens, row.user_id, row.github_user_id)
    await pool.query(`UPDATE public.github_connections SET token_ciphertext=$1, token_iv=$2, token_auth_tag=$3,
      token_expires_at=NOW()+($4::text || ' seconds')::interval,
      refresh_token_expires_at=CASE WHEN $5::bigint IS NULL THEN refresh_token_expires_at ELSE NOW()+($5::text || ' seconds')::interval END, updated_at=NOW()
      WHERE user_id=$6`, [encrypted.ciphertext, encrypted.iv, encrypted.authTag, refreshed.expires_in || 28800, refreshed.refresh_token_expires_in || null, userId])
  }
  return { token: tokens.accessToken, login: row.github_login }
}

app.post('/api/ai/chat', requireTrustedOrigin, requireSession, aiChatLimiter, async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message || message.length > 3000) return res.status(400).json({ error: 'Enter a message of up to 3,000 characters.' })
  const history = req.body?.history
  if (history !== undefined && (!Array.isArray(history) || history.length > 10 || history.some((item) =>
    !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 1500))) {
    return res.status(400).json({ error: 'Chat history is invalid. Start a new conversation and try again.' })
  }

  try {
    const agentUrl = (process.env.PYTHON_AGENT_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:8001')).replace(/\/$/, '')
    if (!agentUrl) return res.status(503).json({ error: 'AI Analysis service is not configured on the backend.' })

    const selectedResult = await pool.query(
      'SELECT full_name FROM public.github_repositories WHERE user_id=$1 AND selected=true ORDER BY full_name LIMIT 100',
      [req.user.id],
    )
    let selectedRepositories = selectedResult.rows.map((row) => row.full_name)
    let githubConnection = null
    if (selectedRepositories.length) githubConnection = await getGitHubAccessToken(req.user.id)
    if (!githubConnection) selectedRepositories = []

    const response = await fetch(`${agentUrl}/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken(req)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: req.user.id,
        message,
        history: Array.isArray(history) ? history : [],
        selected_repositories: selectedRepositories,
        github_access_token: githubConnection?.token || null,
      }),
      signal: AbortSignal.timeout(95000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const status = [401, 403, 429, 503, 504].includes(response.status) ? response.status : 502
      const message = typeof payload.detail === 'string' ? payload.detail : 'AI Analysis could not complete the request. Please retry.'
      return res.status(status).json({ error: message })
    }
    if (typeof payload.answer !== 'string' || !payload.answer.trim()) return res.status(502).json({ error: 'The AI returned an empty response. Please retry.' })
    return res.json({ answer: payload.answer, githubAvailable: Boolean(githubConnection && selectedRepositories.length), selectedRepositories })
  } catch (error) {
    if (error.message.includes('GitHub session') || error.message.includes('decrypted')) {
      return res.status(401).json({ error: error.message })
    }
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'AI Analysis took too long. Please retry.' })
    }
    console.error('AI agent request failed:', error.message)
    return res.status(502).json({ error: 'Could not reach AI Analysis. Please retry.' })
  }
})

app.get('/api/github/status', requireSession, async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store')
  try {
    const result = await pool.query(`SELECT c.github_login, c.created_at,
      (SELECT COUNT(*)::int FROM public.github_repositories r WHERE r.user_id=c.user_id AND r.selected=true) AS selected_count
      FROM public.github_connections c WHERE c.user_id=$1`, [req.user.id])
    const connection = result.rows[0]
    return res.json({ connected: Boolean(connection), githubLogin: connection?.github_login || null, connectedAt: connection?.created_at || null, selectedCount: connection?.selected_count || 0 })
  } catch (error) { return next(error) }
})

app.get('/api/github/repositories', requireSession, async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  try {
    const connection = await getGitHubAccessToken(req.user.id)
    if (!connection) return res.status(409).json({ error: 'Connect GitHub to see your repositories.' })
    let pageUrl = 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'
    const repos = []
    for (let page = 0; page < 10 && pageUrl; page += 1) {
      const response = await fetch(pageUrl, { headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) })
      if (!response.ok) return res.status(response.status === 401 || response.status === 403 ? 502 : response.status).json({ error: 'GitHub could not list repositories. Reconnect or check the GitHub App permissions.' })
      const data = await response.json()
      if (!Array.isArray(data)) return res.status(502).json({ error: 'GitHub returned an unexpected repository response.' })
      repos.push(...data)
      const next = response.headers.get('link')?.split(',').find((item) => item.includes('rel="next"'))
      pageUrl = next?.match(/<([^>]+)>/)?.[1] || ''
    }
    for (const repo of repos) {
      await pool.query(`INSERT INTO public.github_repositories (user_id, repository_id, full_name, private, html_url, description, language, default_branch, pushed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id, repository_id) DO UPDATE SET
        full_name=EXCLUDED.full_name, private=EXCLUDED.private, html_url=EXCLUDED.html_url, description=EXCLUDED.description,
        language=EXCLUDED.language, default_branch=EXCLUDED.default_branch, pushed_at=EXCLUDED.pushed_at, synced_at=NOW()`,
      [req.user.id, String(repo.id), repo.full_name, repo.private, repo.html_url, repo.description, repo.language, repo.default_branch, repo.pushed_at])
    }
    const saved = await pool.query(`SELECT repository_id::text AS id, full_name, private, html_url, description, language, default_branch, pushed_at, selected
      FROM public.github_repositories WHERE user_id=$1 ORDER BY full_name`, [req.user.id])
    return res.json({ githubLogin: connection.login, repositories: saved.rows })
  } catch (error) {
    return res.status(error.message.includes('GitHub session') || error.message.includes('decrypted') ? 401 : 500).json({ error: error.message.includes('GitHub session') || error.message.includes('decrypted') ? error.message : 'Could not load GitHub repositories. Please retry.' })
  }
})

app.put('/api/github/repositories/selection', requireTrustedOrigin, requireSession, async (req, res) => {
  const ids = req.body?.repositoryIds
  if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => !/^\d{1,20}$/.test(String(id)))) return res.status(400).json({ error: 'Choose up to 200 valid repositories.' })
  try {
    const idStrings = [...new Set(ids.map(String))]
    const found = await pool.query('SELECT repository_id::text FROM public.github_repositories WHERE user_id=$1 AND repository_id=ANY($2::bigint[])', [req.user.id, idStrings])
    if (found.rowCount !== idStrings.length) return res.status(400).json({ error: 'One or more repositories are not connected to your account.' })
    await pool.query('UPDATE public.github_repositories SET selected=(repository_id=ANY($2::bigint[])) WHERE user_id=$1', [req.user.id, idStrings])
    return res.json({ ok: true, selectedCount: idStrings.length })
  } catch { return res.status(500).json({ error: 'Could not save repository selection.' }) }
})

app.delete('/api/github/connection', requireTrustedOrigin, requireSession, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM public.github_analysis_refreshes WHERE user_id=$1', [req.user.id])
    await client.query('DELETE FROM public.github_repositories WHERE user_id=$1', [req.user.id])
    await client.query('DELETE FROM public.github_connections WHERE user_id=$1', [req.user.id])
    await client.query('DELETE FROM public.github_oauth_states WHERE user_id=$1', [req.user.id])
    await client.query('COMMIT')
    return res.json({ ok: true })
  } catch {
    await client.query('ROLLBACK').catch(() => {})
    return res.status(500).json({ error: 'Could not disconnect GitHub. Please try again.' })
  } finally { client.release() }
})

app.post('/api/github/webhook', async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) return res.status(503).json({ error: 'GitHub webhook is not configured.' })
  const signature = req.get('x-hub-signature-256') || ''
  if (!Buffer.isBuffer(req.body) || !/^sha256=[\da-f]{64}$/i.test(signature)) return res.status(401).json({ error: 'Invalid webhook signature.' })
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(req.body).digest('hex')}`)
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return res.status(401).json({ error: 'Invalid webhook signature.' })
  let payload
  try { payload = JSON.parse(req.body.toString('utf8')) } catch { return res.status(400).json({ error: 'Invalid webhook payload.' }) }
  if (req.get('x-github-event') !== 'push') return res.status(202).json({ received: true, queued: 0 })
  const repoId = String(payload.repository?.id || '')
  const deliveryId = req.get('x-github-delivery') || randomUUID()
  if (!/^\d{1,20}$/.test(repoId)) return res.status(400).json({ error: 'Push event has no valid repository id.' })
  try {
    const result = await pool.query(`INSERT INTO public.github_analysis_refreshes (delivery_id,user_id,repository_id)
      SELECT $1, user_id, repository_id FROM public.github_repositories WHERE repository_id=$2 AND selected=true
      ON CONFLICT (delivery_id,user_id,repository_id) DO NOTHING`, [deliveryId, repoId])
    return res.status(202).json({ received: true, queued: result.rowCount })
  } catch { return res.status(500).json({ error: 'Could not enqueue repository refresh.' }) }
})

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

app.get('/api/jobs', requireSession, async (req, res) => {
  if (!indianApiKey) return res.status(503).json({ error: 'Job listings are not configured. Add INDIANAPI_API_KEY to backend/.env.' })

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120).toLowerCase() : ''
  const location = typeof req.query.location === 'string' ? req.query.location.trim().slice(0, 80).toLowerCase() : ''
  const experience = typeof req.query.experience === 'string' ? req.query.experience.trim().slice(0, 80).toLowerCase() : ''
  const listingType = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : 'all'
  const page = Number(req.query.page || 1)
  if (!Number.isInteger(page) || page < 1 || page > 100) return res.status(400).json({ error: 'Page must be a whole number from 1 to 100.' })
  if (!['all', 'internships', 'jobs'].includes(listingType)) return res.status(400).json({ error: 'Choose all listings, jobs, or internships.' })

  if (!indianApiCache || indianApiCache.expiresAt <= Date.now()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const upstream = await fetch('https://jobs.indianapi.in/jobs?limit=100', {
        headers: { Accept: 'application/json', 'X-Api-Key': indianApiKey },
        signal: controller.signal,
      })
      if (!upstream.ok) {
        console.error(`IndianAPI jobs returned HTTP ${upstream.status}`)
        return res.status(502).json({ error: upstream.status === 401 ? 'The IndianAPI key was rejected. Check INDIANAPI_API_KEY in backend/.env.' : upstream.status === 429 ? 'The jobs service is busy. Please try again in a moment.' : 'The jobs service is temporarily unavailable.' })
      }
      const responseData = await upstream.json()
      const records = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.jobs) ? responseData.jobs
          : Array.isArray(responseData?.data) ? responseData.data
            : Array.isArray(responseData?.results) ? responseData.results
              : null
      if (!records) return res.status(502).json({ error: 'The jobs service returned an unexpected response.' })

      const jobs = records.map((job, index) => {
        const title = job.job_title || job.title || ''
        const companyName = job.company || job.company_name || ''
        const applicationUrl = job.apply_link || job.application_url || job.application_link || ''
        return {
          id: String(job.id ?? (applicationUrl || `${companyName}-${title}-${index}`)),
          title: String(title),
          listingTitle: String(job.title || title),
          companyName: String(companyName),
          companyLogo: job.company_logo || job.logo || '',
          description: typeof job.job_description === 'string' ? job.job_description : typeof job.description === 'string' ? job.description : '',
          location: String(job.location || ''),
          experience: String(job.experience || ''),
          jobType: String(job.job_type || job.employment_type || ''),
          requiredSkills: typeof job.education_and_skills === 'string' ? job.education_and_skills : Array.isArray(job.education_and_skills) ? job.education_and_skills.join(', ') : '',
          responsibilities: typeof job.role_and_responsibility === 'string' ? job.role_and_responsibility : '',
          aboutCompany: typeof job.about_company === 'string' ? job.about_company : '',
          applicationUrl: String(applicationUrl),
          postedDate: String(job.posted_date || ''),
          source: 'IndianAPI',
        }
      })
      indianApiCache = { jobs, expiresAt: Date.now() + indianApiCacheTtlMs }
    } catch (error) {
      console.error('IndianAPI jobs request failed:', error.name === 'AbortError' ? 'request timed out' : error.message)
      return res.status(502).json({ error: 'Could not load jobs right now. Please try again.' })
    } finally {
      clearTimeout(timeout)
    }
  }

  const filteredJobs = indianApiCache.jobs.filter((job) => {
    const internship = `${job.title} ${job.listingTitle} ${job.jobType}`.toLowerCase().match(/intern|apprentice/)
    const searchable = [job.title, job.listingTitle, job.companyName, job.description, job.location, job.experience, job.requiredSkills, job.responsibilities]
      .some((value) => value.toLowerCase().includes(q))
    if (q && !searchable) return false
    if (location && !job.location.toLowerCase().includes(location)) return false
    if (experience && !job.experience.toLowerCase().includes(experience)) return false
    if (listingType === 'internships' && !internship) return false
    if (listingType === 'jobs' && internship) return false
    return true
  })
  const pageSize = 10
  const start = (page - 1) * pageSize
  const pageJobs = filteredJobs.slice(start, start + pageSize)
  return res.json({
    jobs: pageJobs,
    totalCount: filteredJobs.length,
    loadedCount: indianApiCache.jobs.length,
    page,
    pageSize,
    hasMore: start + pageSize < filteredJobs.length,
    source: 'IndianAPI',
  })
})

app.post('/api/resumes', requireTrustedOrigin, requireSession, requireResumeStorage, resumeUpload.single('resume'), async (req, res, next) => {
  let storagePath
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Choose a PDF or DOCX resume to upload.' })
    if (!isAllowedResumeContent(file)) return res.status(400).json({ error: 'The file content does not match a supported PDF or DOCX resume.' })

    const extension = extname(file.originalname).toLowerCase()
    const contentType = acceptedResumeTypes[extension]
    const safeFilename = basename(file.originalname).replace(/[\u0000-\u001f]/g, '').slice(0, 255) || `resume${extension}`
    const existing = await pool.query(
      'SELECT 1 FROM public.resumes WHERE user_id = $1 AND original_filename = $2 LIMIT 1',
      [req.user.id, safeFilename],
    )
    if (existing.rowCount) {
      return res.status(409).json({ error: 'A resume with this filename already exists. Rename the file before uploading it again.' })
    }

    storagePath = `${req.user.id}/${safeFilename}`
    const uploaded = await supabase.storage.from(resumeBucket).upload(storagePath, file.buffer, {
      contentType,
      upsert: false,
    })
    if (uploaded.error) {
      const duplicate = await pool.query(
        'SELECT 1 FROM public.resumes WHERE user_id = $1 AND original_filename = $2 LIMIT 1',
        [req.user.id, safeFilename],
      )
      if (duplicate.rowCount) {
        return res.status(409).json({ error: 'A resume with this filename already exists. Rename the file before uploading it again.' })
      }
      return res.status(502).json({ error: 'Could not store the resume. Please try again.' })
    }

    try {
      const result = await pool.query(
        `INSERT INTO public.resumes (id, user_id, original_filename, storage_path, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, original_filename, content_type, size_bytes, created_at`,
        [randomUUID(), req.user.id, safeFilename, storagePath, contentType, file.size],
      )
      return res.status(201).json({ resume: resumeDto(result.rows[0]) })
    } catch (error) {
      await supabase.storage.from(resumeBucket).remove([storagePath]).catch(() => {})
      return next(error)
    }
  } catch (error) {
    if (storagePath) await supabase.storage.from(resumeBucket).remove([storagePath]).catch(() => {})
    return next(error)
  }
})

app.get('/api/resumes', requireSession, requireResumeStorage, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, original_filename, content_type, size_bytes, created_at
       FROM public.resumes WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id],
    )
    return res.json({ resumes: result.rows.map(resumeDto) })
  } catch (error) {
    return next(error)
  }
})

async function createResumeLink(req, res, next, disposition) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid resume id.' })
    }
    const result = await pool.query(
      `SELECT id, original_filename, storage_path FROM public.resumes WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [req.params.id, req.user.id],
    )
    const resume = result.rows[0]
    if (!resume) return res.status(404).json({ error: 'Resume not found.' })
    const { data, error } = await supabase.storage.from(resumeBucket).createSignedUrl(
      resume.storage_path,
      60,
      { download: disposition === 'attachment' ? resume.original_filename : false },
    )
    if (error) return res.status(502).json({ error: 'Could not open this resume. Please try again.' })
    return res.json({ url: data.signedUrl })
  } catch (error) {
    return next(error)
  }
}

app.get('/api/resumes/:id/view', requireSession, requireResumeStorage, (req, res, next) => createResumeLink(req, res, next, 'inline'))
app.get('/api/resumes/:id/download', requireSession, requireResumeStorage, (req, res, next) => createResumeLink(req, res, next, 'attachment'))

app.delete('/api/resumes/:id', requireTrustedOrigin, requireSession, requireResumeStorage, async (req, res, next) => {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid resume id.' })
    }
    const result = await pool.query(
      `SELECT storage_path FROM public.resumes WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [req.params.id, req.user.id],
    )
    const resume = result.rows[0]
    if (!resume) return res.status(404).json({ error: 'Resume not found.' })

    const removed = await supabase.storage.from(resumeBucket).remove([resume.storage_path])
    if (removed.error) return res.status(502).json({ error: 'Could not delete the stored resume. Please try again.' })
    await pool.query(`DELETE FROM public.resumes WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id])
    return res.json({ ok: true })
  } catch (error) {
    return next(error)
  }
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Resume files must be 10 MB or smaller.' : 'Upload one PDF or DOCX file at a time.'
    return res.status(status).json({ error: message })
  }
  if (error.message === 'Upload a PDF or DOCX resume.') return res.status(400).json({ error: error.message })
  console.error('API request failed:', error.message)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

async function startServer() {
  if (supabase) {
    try {
      await ensurePrivateResumeBucket()
      console.log('Private resumes bucket is ready.')
    } catch (error) {
      console.error('Could not initialize the private resumes bucket:', error.message)
    }
  } else {
    console.warn('Supabase resume storage is not configured; resume endpoints are disabled.')
  }
  app.listen(port, () => console.log(`Queue_T_pies API listening on port ${port}`))
}

startServer()
