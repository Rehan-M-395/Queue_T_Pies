import { useEffect, useMemo, useState } from 'react'
import dummyJobs from '../../../Dummy/dummy_jobs_50.json'
import JobDetails from './JobDetails'
import { SkillBadges } from './JobSkills'
import { extractJobSkills } from './jobSkillUtils'
import './JobSearch.css'

const pageSize = 10

function shuffle(items) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function normalizeJob(job) {
  const required = job.skills?.required || []
  const preferred = job.skills?.preferred || []
  const city = job.location?.city
  const state = job.location?.state
  const country = job.location?.country
  const location = [city, state, country].filter(Boolean).join(', ')
  const { min_salary: minSalary, max_salary: maxSalary, currency, salary_period: period } = job.compensation || {}
  const salary = Number.isFinite(minSalary) && Number.isFinite(maxSalary)
    ? `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(minSalary)}–${new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(maxSalary)} / ${period || 'year'}`
    : ''
  const experience = job.experience?.level
    ? `${job.experience.level}${Number.isFinite(job.experience.min_years) || Number.isFinite(job.experience.max_years) ? ` · ${job.experience.min_years ?? 0}–${job.experience.max_years ?? 'any'} years` : ''}`
    : ''

  return {
    ...job,
    id: job.job_id,
    title: job.title,
    companyName: job.company?.name || 'Company not listed',
    companyLogo: '',
    description: job.description || '',
    responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities.join('\n') : job.responsibilities || '',
    qualifications: Array.isArray(job.qualifications) ? job.qualifications : [],
    location: location || 'Location not listed',
    experience,
    jobType: job.job_type || job.employment_type || '',
    employmentType: job.employment_type || '',
    workMode: job.work_mode || '',
    salary,
    requiredSkills: [
      required.length ? `Required: ${required.join(', ')}` : '',
      preferred.length ? `Preferred: ${preferred.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
    preferredSkills: preferred,
    applicationUrl: job.application?.application_url || '',
    postedDate: job.application?.posted_at ? new Date(job.application.posted_at).toLocaleDateString() : '',
    aboutCompany: [job.company?.industry, job.company?.company_size].filter(Boolean).join(' · '),
    benefits: job.compensation?.benefits || [],
    source: 'Preview listing',
    isPreview: true,
  }
}

export default function JobSearch() {
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState({ q: '', location: '', experience: '', type: 'all', page: 1 })
  const [allJobs] = useState(() => shuffle(dummyJobs).map(normalizeJob))
  const [selectedJob, setSelectedJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const filteredJobs = useMemo(() => {
    const query = filters.q.trim().toLowerCase()
    const location = filters.location.trim().toLowerCase()
    const experience = filters.experience.trim().toLowerCase()
    return allJobs.filter((job) => {
      const searchable = [job.title, job.companyName, job.description, job.location, job.experience, job.requiredSkills, job.responsibilities, ...(job.metadata?.tags || [])]
        .join(' ').toLowerCase()
      const isInternship = /intern|apprentice/i.test(`${job.title} ${job.jobType}`)
      if (query && !searchable.includes(query)) return false
      if (location && !job.location.toLowerCase().includes(location)) return false
      if (experience && !job.experience.toLowerCase().includes(experience)) return false
      if (filters.type === 'internships' && !isInternship) return false
      if (filters.type === 'jobs' && isInternship) return false
      return true
    })
  }, [allJobs, filters])

  const start = (filters.page - 1) * pageSize
  const jobs = filteredJobs.slice(start, start + pageSize)
  const hasMore = start + pageSize < filteredJobs.length

  useEffect(() => {
    setLoading(true)
    const timer = window.setTimeout(() => setLoading(false), 140)
    return () => window.clearTimeout(timer)
  }, [filters])

  function updateFilter(name, value) {
    setError('')
    setFilters((current) => ({ ...current, [name]: value, page: 1 }))
  }

  function submitSearch(event) {
    event.preventDefault()
    updateFilter('q', keyword.trim())
  }

  function changePage(page) {
    setError('')
    setFilters((current) => ({ ...current, page }))
  }

  if (selectedJob) return <JobDetails job={selectedJob} onBack={() => setSelectedJob(null)} />

  return (
    <div className="job-search">
      <header className="jobs-heading">
        <p className="resume-kicker">YOUR CAREER, IN MOTION</p>
        <h1>Find your next opportunity</h1>
        <p>Explore jobs and internships, then compare each role with the skills in your resume.</p>
      </header>

      <form className="jobs-filters" onSubmit={submitSearch}>
        <label className="jobs-keyword"><span>Search jobs</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Role, skill, or company" /></label>
        <button className="jobs-search-button" type="submit">Search</button>
        <label><span>Location</span><input value={filters.location} onChange={(event) => updateFilter('location', event.target.value)} placeholder="Any location" /></label>
        <label><span>Experience</span><input value={filters.experience} onChange={(event) => updateFilter('experience', event.target.value)} placeholder="e.g. Fresher" /></label>
        <label><span>Listing type</span><select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">Jobs and internships</option><option value="internships">Internships</option><option value="jobs">Jobs</option></select></label>
      </form>

      <div className="jobs-results-heading"><h2>Jobs in India</h2>{!loading && !error && <span>{filteredJobs.length.toLocaleString()} preview listings</span>}</div>
      {loading && <div className="jobs-state" role="status">Loading jobs…</div>}
      {error && <div className="jobs-state jobs-error" role="alert"><p>{error}</p><button type="button" onClick={() => setFilters((current) => ({ ...current }))}>Try again</button></div>}
      {!loading && !error && jobs.length === 0 && <div className="jobs-state">No matching listings found. Try another keyword or filter.</div>}

      {!loading && !error && jobs.length > 0 && <div className="job-list">
        {jobs.map((job) => {
          const skills = extractJobSkills(job)
          return <article className="job-card" key={job.id}>
            <div className="job-card-top">
              {job.companyLogo ? <img className="job-company-logo" src={job.companyLogo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /> : <div className="job-company-placeholder" aria-hidden="true">{job.companyName?.charAt(0) || '?'}</div>}
              <div className="job-title-group"><button className="job-title-open" type="button" onClick={() => setSelectedJob(job)}>{job.title}</button><p>{job.companyName}</p></div>
              <span className="job-location-badge">{job.location}</span>
            </div>
            <p className="job-description">{job.description || 'No description provided.'}</p>
            {job.description && <details className="job-description-detail"><summary>Read full job description</summary><p>{job.description}</p></details>}
            {(skills.length > 0 || job.requiredSkills) && <div className="job-role-areas"><h4>Skills mentioned in listing</h4><SkillBadges skills={skills} />{job.requiredSkills && <details className="job-skills-source"><summary>Required and preferred skills</summary><p>{job.requiredSkills}</p></details>}</div>}
            <div className="job-tags">{job.jobType && <span>{job.jobType}</span>}{job.workMode && <span>{job.workMode}</span>}{job.experience && <span>{job.experience}</span>}{job.salary && <span>{job.salary}</span>}</div>
            <footer className="job-card-footer">
              <button className="job-view-details" type="button" onClick={() => setSelectedJob(job)}>View details</button>
              <span className="job-no-apply" title="This local preview dataset uses placeholder application URLs">Preview only</span>
              <span className="job-source-link preview-label">Preview listing</span>
            </footer>
          </article>
        })}
      </div>}

      {!loading && !error && jobs.length > 0 && <nav className="jobs-pagination" aria-label="Job search pages">
        <button type="button" disabled={filters.page <= 1} onClick={() => changePage(filters.page - 1)}>Previous</button>
        <span>Page {filters.page} of {Math.max(1, Math.ceil(filteredJobs.length / pageSize))}</span>
        <button type="button" disabled={!hasMore} onClick={() => changePage(filters.page + 1)}>Next</button>
      </nav>}
      <p className="jobs-attribution">Preview listings from the local sample dataset. These are not verified live openings; application links are placeholders.</p>
    </div>
  )
}
