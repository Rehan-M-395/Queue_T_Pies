import { useEffect, useState } from 'react'
import { apiRequest } from '../../api'
import './JobSearch.css'

export default function JobSearch() {
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState({ q: '', location: '', experience: '', type: 'all', page: 1 })
  const [jobs, setJobs] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [loadedCount, setLoadedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ page: String(filters.page), type: filters.type })
    if (filters.q) params.set('q', filters.q)
    if (filters.location) params.set('location', filters.location)
    if (filters.experience) params.set('experience', filters.experience)
    apiRequest(`/api/jobs?${params}`)
      .then((result) => {
        if (!active) return
        setJobs(result.jobs)
        setHasMore(result.hasMore)
        setTotalCount(result.totalCount)
        setLoadedCount(result.loadedCount)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load jobs. Please try again.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters])

  function updateFilter(name, value) {
    setLoading(true)
    setError('')
    setFilters((current) => ({ ...current, [name]: value, page: 1 }))
  }

  function submitSearch(event) {
    event.preventDefault()
    updateFilter('q', keyword.trim())
  }

  function changePage(page) {
    setLoading(true)
    setError('')
    setFilters((current) => ({ ...current, page }))
  }

  return (
    <div className="job-search">
      <header className="jobs-heading">
        <p className="resume-kicker">YOUR NEXT OPPORTUNITY</p>
        <h1>Find jobs and internships</h1>
        <p>Explore current listings from IndianAPI. Search by role, skill, company, location, or experience.</p>
      </header>

      <form className="jobs-filters" onSubmit={submitSearch}>
        <label className="jobs-keyword"><span>Search jobs</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Role, skill, or company" /></label>
        <button className="jobs-search-button" type="submit">Search</button>
        <label><span>Location</span><input value={filters.location} onChange={(event) => updateFilter('location', event.target.value)} placeholder="Any location" /></label>
        <label><span>Experience</span><input value={filters.experience} onChange={(event) => updateFilter('experience', event.target.value)} placeholder="e.g. Fresher" /></label>
        <label><span>Listing type</span><select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">Jobs and internships</option><option value="internships">Internships</option><option value="jobs">Jobs</option></select></label>
      </form>

      <div className="jobs-results-heading"><h2>Jobs in India</h2>{!loading && !error && <span>{totalCount.toLocaleString()} matches · {loadedCount.toLocaleString()} loaded</span>}</div>
      {loading && <div className="jobs-state" role="status">Loading jobs…</div>}
      {error && <div className="jobs-state jobs-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setFilters((current) => ({ ...current })) }}>Try again</button></div>}
      {!loading && !error && jobs.length === 0 && <div className="jobs-state">No matching jobs found. Try another keyword or filter.</div>}

      {!loading && !error && jobs.length > 0 && <div className="job-list">
        {jobs.map((job) => <article className="job-card" key={job.id}>
          <div className="job-card-top">
            {job.companyLogo ? <img className="job-company-logo" src={job.companyLogo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /> : <div className="job-company-placeholder" aria-hidden="true">{job.companyName?.charAt(0) || '?'}</div>}
            <div className="job-title-group"><h3>{job.title}</h3><p>{job.companyName}</p></div>
            <span className="job-location-badge">{job.location || 'Location not listed'}</span>
          </div>
          <p className="job-description">{job.description || 'View the original listing for role details.'}</p>
          {job.description && <details className="job-description-detail"><summary>Read full job description</summary><p>{job.description}</p></details>}
          {job.requiredSkills && <div className="job-role-areas"><h4>Required skills &amp; education</h4><p>{job.requiredSkills}</p></div>}
          <div className="job-tags">{job.jobType && <span>{job.jobType}</span>}{job.experience && <span>{job.experience}</span>}{job.postedDate && <span>Posted {job.postedDate}</span>}</div>
          <footer className="job-card-footer">
            {job.applicationUrl ? <a href={job.applicationUrl} target="_blank" rel="noreferrer" className="job-apply-link">Apply Now <span aria-hidden="true">↗</span></a> : <span className="job-no-apply">Application link not provided</span>}
            <span className="job-source-link">Source: IndianAPI</span>
          </footer>
        </article>)}
      </div>}

      {!loading && !error && jobs.length > 0 && <nav className="jobs-pagination" aria-label="Job search pages">
        <button type="button" disabled={filters.page <= 1} onClick={() => changePage(filters.page - 1)}>Previous</button>
        <span>Page {filters.page}</span>
        <button type="button" disabled={!hasMore} onClick={() => changePage(filters.page + 1)}>Next</button>
      </nav>}
      <p className="jobs-attribution">Listings provided by <a href="https://indianapi.in/jobs-api" target="_blank" rel="noreferrer">IndianAPI</a>.</p>
    </div>
  )
}
