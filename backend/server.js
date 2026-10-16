import dotenv from 'dotenv'
import { randomUUID, timingSafeEqual } from 'node:crypto'
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
app.use(express.json({ limit: '20kb' }))
app.use(cookieParser())

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
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

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  resumeStorageConfigured: Boolean(supabase),
  resumeBucketReady,
}))

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
