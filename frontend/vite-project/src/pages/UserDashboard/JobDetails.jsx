import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../api'
import './JobDetails.css'
import { HighlightedText, SkillBadges } from './JobSkills'
import { extractJobSkills } from './jobSkillUtils'

function DetailSection({ title, children }) {
  if (!children) return null
  return <section className="job-detail-section"><h2>{title}</h2><div>{children}</div></section>
}

function skillKey(value) {
  const compact = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const aliases = {
    reactjs: 'react',
    nodejs: 'node',
    restapis: 'restapi',
    postgres: 'postgresql',
  }
  return aliases[compact] || compact
}

function SkillMatchList({ skills, matchedSkills }) {
  if (!skills.length) return <p className="job-skill-match-empty">No skills listed for this section.</p>
  return <ul className="job-skill-match-list">{skills.map((skill) => {
    const matched = matchedSkills.get(skillKey(skill))
    return <li className={matched ? 'is-matched' : 'is-gap'} key={skill} title={matched?.evidence || undefined}>
      <span aria-hidden="true">{matched ? '✓' : '!'}</span>{skill}<small>{matched ? 'In resume' : 'Not found in resume'}</small>
    </li>
  })}</ul>
}

export default function JobDetails({ job, onBack }) {
  const skills = extractJobSkills(job)
  const [resumes, setResumes] = useState([])
  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [resumeLoading, setResumeLoading] = useState(true)
  const [resumeError, setResumeError] = useState('')
  const [portfolioAssessment, setPortfolioAssessment] = useState(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState('')

  const loadResumes = useCallback(async () => {
    setResumeLoading(true)
    setResumeError('')
    try {
      const result = await apiRequest('/api/resumes')
      const analyzed = result.resumes.filter((resume) => resume.skillsStatus === 'complete')
      setResumes(analyzed)
      setSelectedResumeId((current) => analyzed.some((resume) => resume.id === current) ? current : analyzed[0]?.id || '')
    } catch (error) {
      setResumeError(error.message || 'Could not load your analyzed resume skills.')
    } finally {
      setResumeLoading(false)
    }
  }, [])

  useEffect(() => { void loadResumes() }, [loadResumes])

  const selectedResume = resumes.find((resume) => resume.id === selectedResumeId)
  const resumeSkillMap = useMemo(() => new Map(
    (selectedResume?.skills || []).map((skill) => [skillKey(skill.name), skill]),
  ), [selectedResume])
  const requiredSkills = job.skills?.required?.length ? job.skills.required : skills
  const preferredSkills = job.skills?.preferred || []
  const portfolioSkills = [...(job.skills?.required || []), ...preferredSkills]
  const requiredMatchedCount = requiredSkills.filter((skill) => resumeSkillMap.has(skillKey(skill))).length
  const portfolioGaps = (portfolioAssessment?.skills || []).filter((item) => ['partially_demonstrated', 'not_demonstrated_in_scope', 'insufficient_evidence'].includes(item.status))

  const analyzePortfolio = async () => {
    setPortfolioLoading(true)
    setPortfolioError('')
    try {
      const result = await apiRequest('/api/github/portfolio-analysis', {
        method: 'POST',
        body: JSON.stringify({
          job: { id: job.id || job.job_id, title: job.title, skills: { required: job.skills?.required || [], preferred: preferredSkills } },
          resumeId: selectedResume?.id || null,
        }),
      })
      setPortfolioAssessment(result.assessment)
    } catch (error) {
      setPortfolioError(error.message || 'Could not analyze your GitHub portfolio.')
    } finally {
      setPortfolioLoading(false)
    }
  }

  const statusLabel = {
    demonstrated: 'Demonstrated in code',
    partially_demonstrated: 'Partially demonstrated',
    not_demonstrated_in_scope: 'No evidence found in inspected code',
    insufficient_evidence: 'Insufficient evidence',
  }

  return (
    <article className="job-details-view">
      <button className="job-details-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to jobs</button>
      <header className="job-details-header">
        {job.companyLogo ? <img className="job-details-logo" src={job.companyLogo} alt="" /> : <div className="job-details-logo-placeholder" aria-hidden="true">{job.companyName?.charAt(0) || '?'}</div>}
        <div className="job-details-title"><p className="resume-kicker">{job.source || 'Job listing'}</p><h1>{job.title}</h1><p>{job.companyName}</p></div>
        {!job.isPreview && job.applicationUrl && <a className="job-apply-link job-details-apply" href={job.applicationUrl} target="_blank" rel="noreferrer">Apply Now <span aria-hidden="true">↗</span></a>}
      </header>

      <div className="job-details-meta">
        {job.location && <span><strong>Location</strong>{job.location}</span>}
        {job.experience && <span><strong>Experience</strong>{job.experience}</span>}
        {job.jobType && <span><strong>Employment</strong>{job.jobType}</span>}
        {job.workMode && <span><strong>Work mode</strong>{job.workMode}</span>}
        {job.salary && <span><strong>Compensation</strong>{job.salary}</span>}
        {job.postedDate && <span><strong>Posted</strong>{job.postedDate}</span>}
      </div>

      <section className="job-skill-match" aria-live="polite">
        <div className="job-skill-match-heading">
          <div><p className="resume-kicker">PERSONALIZED TO YOUR RESUME</p><h2>Job skill match</h2></div>
          {selectedResume && <span className="job-skill-match-count">{requiredMatchedCount} / {requiredSkills.length} required skills found</span>}
        </div>
        {resumeLoading ? <p className="job-skill-match-status">Loading your resume skills…</p> : resumeError ? (
          <div className="job-skill-match-status error"><span>{resumeError}</span><button type="button" onClick={() => void loadResumes()}>Retry</button></div>
        ) : !selectedResume ? (
          <p className="job-skill-match-status">No analyzed resume found. Upload a resume and analyze its skills in the Resume section to see your matches here.</p>
        ) : (
          <>
            <label className="job-resume-select">Compared resume
              <select value={selectedResumeId} onChange={(event) => setSelectedResumeId(event.target.value)}>
                {resumes.map((resume) => <option value={resume.id} key={resume.id}>{resume.originalFilename}</option>)}
              </select>
            </label>
            <div className="job-skill-match-groups">
              <div><h3>Required skills</h3><SkillMatchList skills={requiredSkills} matchedSkills={resumeSkillMap} /></div>
              {preferredSkills.length > 0 && <div><h3>Preferred skills</h3><SkillMatchList skills={preferredSkills} matchedSkills={resumeSkillMap} /></div>}
            </div>
            <p className="job-skill-match-note">“Not found in resume” means the skill wasn’t identified in the resume text; it doesn’t necessarily mean you don’t have it. Hover over a match to see its resume evidence.</p>
          </>
        )}
      </section>

      <section className="github-portfolio" aria-live="polite">
        <div className="github-portfolio-heading">
          <div><p className="resume-kicker">CODE EVIDENCE · SEPARATE FROM RESUME MATCH</p><h2>GitHub portfolio assessment</h2></div>
          <button type="button" className="github-portfolio-button" onClick={() => void analyzePortfolio()} disabled={portfolioLoading || !portfolioSkills.length}>
            {portfolioLoading ? 'Analyzing selected repositories…' : portfolioAssessment ? 'Analyze again' : 'Analyze GitHub Portfolio'}
          </button>
        </div>
        {!portfolioSkills.length && <p className="job-skill-match-status">This listing has no structured required or preferred skills to assess.</p>}
        {portfolioError && <div className="job-skill-match-status error"><span>{portfolioError}</span><button type="button" onClick={() => void analyzePortfolio()} disabled={portfolioLoading}>Retry</button></div>}
        {portfolioLoading && <p className="job-skill-match-status">Inspecting selected repository trees, commits, and relevant source files. This may take a few minutes.</p>}
        {portfolioAssessment && <>
          <p className="github-portfolio-summary">{portfolioAssessment.summary || 'Assessment complete.'}{portfolioAssessment.partial && ' Some repositories or skills could not be fully assessed.'}</p>
          {portfolioAssessment.repositories?.length === 0 && <p className="job-skill-match-status">No repository results were returned. Check your GitHub connection and selected repositories.</p>}
          {portfolioGaps.length > 0 && <section className="github-gap-list"><h3>Evidence gaps to address</h3><p>These are gaps in the inspected portfolio evidence, not proof that you lack the skill.</p><ul>{portfolioGaps.map((item) => <li key={`${item.category}-${item.skill}`}><strong>{item.skill}</strong><span>{statusLabel[item.status]}</span>{item.recommendations?.length > 0 && <small>Recommendation: {item.recommendations[0]}</small>}</li>)}</ul></section>}
          <div className="github-portfolio-results">
            {portfolioAssessment.skills?.map((item) => <article className="github-skill-result" key={`${item.category}-${item.skill}`}>
              <header><div><span className="github-skill-category">{item.category}</span><h3>{item.skill}</h3></div><span className={`github-skill-status ${item.status}`}>{statusLabel[item.status] || statusLabel.insufficient_evidence}</span></header>
              <p>{item.explanation}</p>
              {item.evidence?.length > 0 ? <ul className="github-skill-evidence">{item.evidence.map((evidence, index) => <li key={`${evidence.repository}-${evidence.path}-${index}`}>
                <a href={evidence.repositoryUrl} target="_blank" rel="noreferrer">{evidence.repository}</a>
                <code>{evidence.path}{evidence.startLine ? `:${evidence.startLine}${evidence.endLine && evidence.endLine !== evidence.startLine ? `-${evidence.endLine}` : ''}` : ''}</code>
                {evidence.snippet && <pre>{evidence.snippet}</pre>}
                {evidence.explanation && <small>{evidence.explanation}</small>}
                <small>Analyzed commit: <code>{evidence.commitSha}</code></small>
              </li>)}</ul> : <p className="github-no-evidence">No code evidence was returned. This does not establish that you lack this skill.</p>}
              {item.limitations && <p className="github-skill-limitation">Limitations: {item.limitations}</p>}
              {item.recommendations?.length > 0 && <div className="github-recommendations"><strong>Recommendations only · not completed achievements</strong><ul>{item.recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul></div>}
            </article>)}
          </div>
          {portfolioAssessment.repositories?.length > 0 && <details className="github-assessed-repos"><summary>Repositories and analyzed commits</summary><ul>{portfolioAssessment.repositories.map((repo) => <li key={repo.full_name}><a href={repo.html_url} target="_blank" rel="noreferrer">{repo.full_name}</a><code>{repo.commit_sha || 'Commit unavailable'}</code><span>{repo.status}</span>{repo.limitations && <small>{repo.limitations}</small>}</li>)}</ul></details>}
        </>}
        {!portfolioAssessment && !portfolioLoading && !portfolioError && <p className="job-skill-match-status">Analyze code in your selected GitHub repositories to see evidence for this job’s skills. Resume results above remain separate.</p>}
      </section>

      <div className="job-details-content">
        <DetailSection title="Skills mentioned in listing"><SkillBadges skills={skills} />{job.requiredSkills && <p className="job-details-copy job-skills-source"><HighlightedText text={job.requiredSkills} skills={skills} /></p>}</DetailSection>
        {job.preferredSkills?.length > 0 && <DetailSection title="Preferred skills"><SkillBadges skills={job.preferredSkills} /></DetailSection>}
        <DetailSection title="Job description"><p className="job-details-copy"><HighlightedText text={job.description || 'No job description was provided.'} skills={skills} /></p></DetailSection>
        <DetailSection title="Responsibilities"><p className="job-details-copy"><HighlightedText text={job.responsibilities || 'No responsibilities were provided.'} skills={skills} /></p></DetailSection>
        <DetailSection title="About the company"><p className="job-details-copy">{job.aboutCompany || 'No company description was provided.'}</p></DetailSection>
        {job.benefits?.length > 0 && <DetailSection title="Benefits"><ul className="job-detail-list">{job.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul></DetailSection>}
        {job.qualifications?.length > 0 && <DetailSection title="Qualifications"><ul className="job-detail-list">{job.qualifications.map((qualification) => <li key={qualification}>{qualification}</li>)}</ul></DetailSection>}
        {job.education && <DetailSection title="Education"><div className="job-details-copy"><p>Minimum qualification: {job.education.minimum_qualification || 'Not specified'}</p>{job.education.eligible_degrees?.length > 0 && <p>Eligible degrees: {job.education.eligible_degrees.join(', ')}</p>}{job.education.eligible_branches?.length > 0 && <p>Eligible branches: {job.education.eligible_branches.join(', ')}</p>}{job.education.minimum_cgpa != null && <p>Minimum CGPA: {job.education.minimum_cgpa}</p>}</div></DetailSection>}
        {job.recruitment?.rounds?.length > 0 && <DetailSection title="Recruitment process"><ul className="job-detail-list">{job.recruitment.rounds.map((round) => <li key={round}>{round}</li>)}</ul></DetailSection>}
      </div>
      <footer className="job-details-footer">
        {job.isPreview ? <span className="job-no-apply">Preview only — application link is a placeholder</span> : job.applicationUrl ? <a className="job-apply-link" href={job.applicationUrl} target="_blank" rel="noreferrer">Apply Now <span aria-hidden="true">↗</span></a> : <span className="job-no-apply">Application link not provided</span>}
        <span>{job.source || 'Job listing'}</span>
      </footer>
    </article>
  )
}
