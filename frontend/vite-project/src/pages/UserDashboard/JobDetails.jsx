import './JobDetails.css'
import { HighlightedText, SkillBadges } from './JobSkills'
import { extractJobSkills } from './jobSkillUtils'

function DetailSection({ title, children }) {
  if (!children) return null
  return <section className="job-detail-section"><h2>{title}</h2><div>{children}</div></section>
}

export default function JobDetails({ job, onBack }) {
  const skills = extractJobSkills(job)
  return (
    <article className="job-details-view">
      <button className="job-details-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to jobs</button>
      <header className="job-details-header">
        {job.companyLogo ? <img className="job-details-logo" src={job.companyLogo} alt="" /> : <div className="job-details-logo-placeholder" aria-hidden="true">{job.companyName?.charAt(0) || '?'}</div>}
        <div className="job-details-title"><p className="resume-kicker">{job.source || 'Job listing'}</p><h1>{job.title}</h1><p>{job.companyName}</p></div>
        {job.applicationUrl && <a className="job-apply-link job-details-apply" href={job.applicationUrl} target="_blank" rel="noreferrer">Apply Now <span aria-hidden="true">↗</span></a>}
      </header>

      <div className="job-details-meta">
        {job.location && <span><strong>Location</strong>{job.location}</span>}
        {job.experience && <span><strong>Experience</strong>{job.experience}</span>}
        {job.jobType && <span><strong>Employment</strong>{job.jobType}</span>}
        {job.postedDate && <span><strong>Posted</strong>{job.postedDate}</span>}
      </div>

      <div className="job-details-content">
        <DetailSection title="Skills mentioned in listing"><SkillBadges skills={skills} />{job.requiredSkills && <p className="job-details-copy job-skills-source"><HighlightedText text={job.requiredSkills} skills={skills} /></p>}</DetailSection>
        <DetailSection title="Job description"><p className="job-details-copy"><HighlightedText text={job.description || 'No job description was provided.'} skills={skills} /></p></DetailSection>
        <DetailSection title="Responsibilities"><p className="job-details-copy"><HighlightedText text={job.responsibilities || 'No responsibilities were provided.'} skills={skills} /></p></DetailSection>
        <DetailSection title="About the company"><p className="job-details-copy">{job.aboutCompany || 'No company description was provided.'}</p></DetailSection>
      </div>
      <footer className="job-details-footer">
        {job.applicationUrl ? <a className="job-apply-link" href={job.applicationUrl} target="_blank" rel="noreferrer">Apply Now <span aria-hidden="true">↗</span></a> : <span className="job-no-apply">Application link not provided</span>}
        <span>Listing provided by IndianAPI</span>
      </footer>
    </article>
  )
}
