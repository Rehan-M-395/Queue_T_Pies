import { useEffect, useState } from 'react'
import { apiRequest } from '../../api'

const maxFileSize = 10 * 1024 * 1024

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ResumeManager() {
  const [resumes, setResumes] = useState([])
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [analyzingResumeId, setAnalyzingResumeId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    apiRequest('/api/resumes')
      .then(({ resumes: items }) => { if (active) setResumes(items) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function analyzeResume(id) {
    setError('')
    setMessage('')
    setAnalyzingResumeId(id)
    setResumes((current) => current.map((resume) => resume.id === id ? { ...resume, skillsStatus: 'analyzing' } : resume))
    try {
      const result = await apiRequest(`/api/resumes/${id}/analyze`, { method: 'POST' })
      setResumes((current) => current.map((resume) => resume.id === id
        ? { ...resume, skills: result.skills, skillsStatus: result.skillsStatus, skillsAnalyzedAt: result.skillsAnalyzedAt }
        : resume))
      setMessage('Resume analysis complete. Extracted skills are shown below.')
    } catch (requestError) {
      setResumes((current) => current.map((resume) => resume.id === id ? { ...resume, skillsStatus: 'failed' } : resume))
      setError(requestError.message)
    } finally {
      setAnalyzingResumeId(null)
    }
  }

  async function uploadResume(event) {
    event.preventDefault()
    if (!file) return
    if (file.size > maxFileSize) {
      setError('Resume files must be 10 MB or smaller.')
      return
    }
    setUploading(true)
    setError('')
    setMessage('')
    const formData = new FormData()
    formData.append('resume', file)
    const uploadForm = event.currentTarget
    try {
      const { resume } = await apiRequest('/api/resumes', { method: 'POST', body: formData })
      setFile(null)
      uploadForm.reset()
      setResumes((current) => [resume, ...current.filter((item) => item.id !== resume.id)])
      setUploading(false)
      await analyzeResume(resume.id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploading(false)
    }
  }

  async function openResume(id, action) {
    setError('')
    const newTab = window.open('about:blank', '_blank')
    if (newTab) newTab.opener = null
    try {
      const { url } = await apiRequest(`/api/resumes/${id}/${action}`)
      if (newTab) newTab.location.href = url
      else window.location.assign(url)
    } catch (requestError) {
      newTab?.close()
      setError(requestError.message)
    }
  }

  async function deleteResume(resume) {
    if (!window.confirm(`Delete “${resume.originalFilename}”?`)) return
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/resumes/${resume.id}`, { method: 'DELETE' })
      setResumes((current) => current.filter((item) => item.id !== resume.id))
      setMessage('Resume deleted.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="resume-manager">
      <div className="resume-manager-heading">
        <p className="resume-kicker">YOUR DOCUMENTS</p>
        <h1>Resume</h1>
        <p>Upload your resume to extract the skills it describes.</p>
      </div>

      <form className="resume-upload" onSubmit={uploadResume}>
        <label htmlFor="resume-file">Upload a resume</label>
        <p>PDF or DOCX · up to 10 MB</p>
        <div className="resume-upload-row">
          <input id="resume-file" type="file" disabled={uploading || Boolean(analyzingResumeId)} accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <button type="submit" className="resume-upload-button" disabled={!file || uploading || Boolean(analyzingResumeId)}>{uploading ? 'Uploading…' : analyzingResumeId ? 'Analysing resume…' : 'Upload file'}</button>
        </div>
        {file && <span className="selected-file">Selected: {file.name}</span>}
      </form>

      {error && <p className="resume-feedback error" role="alert">{error}</p>}
      {message && <p className="resume-feedback success" role="status">{message}</p>}

      <div className="resume-list-heading"><h2>Your resumes</h2><span>{resumes.length}</span></div>
      {loading ? <p className="resume-empty">Loading your resumes…</p> : resumes.length === 0 ? (
        <div className="resume-empty"><span aria-hidden="true">▤</span><p>No resumes uploaded yet.</p></div>
      ) : (
        <ul className="resume-list">
          {resumes.map((resume) => <li key={resume.id} className="resume-item">
            <div className="resume-file-icon" aria-hidden="true">{resume.contentType === 'application/pdf' ? 'PDF' : 'DOC'}</div>
            <div className="resume-file-info"><strong title={resume.originalFilename}>{resume.originalFilename}</strong><span>{formatBytes(resume.sizeBytes)} · {new Date(resume.createdAt).toLocaleDateString()}</span></div>
            <div className="resume-actions"><button onClick={() => openResume(resume.id, 'view')} type="button">View</button><button onClick={() => openResume(resume.id, 'download')} type="button">Download</button><button className="delete-resume" onClick={() => deleteResume(resume)} type="button">Delete</button></div>
            <div className="resume-skills" aria-live="polite">
              {analyzingResumeId === resume.id || resume.skillsStatus === 'analyzing' ? (
                <p className="resume-skills-status"><span className="resume-skill-spinner" aria-hidden="true" /> Analysing resume and extracting skills…</p>
              ) : resume.skillsStatus === 'complete' ? (
                <>
                  <h3>Skills found in this resume</h3>
                  {resume.skills?.length ? <ul className="resume-skill-list">{resume.skills.map((skill) => <li key={`${resume.id}-${skill.name}`} title={skill.evidence}>{skill.name}</li>)}</ul> : <p className="resume-skills-status">No skills were identified in the readable resume text.</p>}
                </>
              ) : resume.skillsStatus === 'failed' ? (
                <><p className="resume-skills-status">Resume analysis failed.</p><button className="resume-analyze-retry" disabled={Boolean(analyzingResumeId)} onClick={() => analyzeResume(resume.id)} type="button">Retry analysis</button></>
              ) : (
                <><h3>Skills found in this resume</h3><button className="resume-analyze-retry" disabled={Boolean(analyzingResumeId)} onClick={() => analyzeResume(resume.id)} type="button">Analyze skills</button></>
              )}
            </div>
          </li>)}
        </ul>
      )}
    </div>
  )
}
