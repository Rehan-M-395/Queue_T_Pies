import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../api'
import MarkdownMessage from '../../components/MarkdownMessage'
import './AIAnalysis.css'

const suggestions = [
  'How can I tailor my resume for a software engineering role?',
  'Which skills should I prioritize for the roles I want?',
  'Help me create a 30-day plan to prepare for interviews.',
]

export default function AIAnalysis() {
  const [messages, setMessages] = useState([])
  const [resumes, setResumes] = useState([])
  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [resumeLoading, setResumeLoading] = useState(true)
  const [resumeError, setResumeError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [failedRequest, setFailedRequest] = useState(null)
  const endOfMessages = useRef(null)

  useEffect(() => {
    let active = true
    apiRequest('/api/resumes')
      .then(({ resumes: items }) => {
        if (!active) return
        const available = Array.isArray(items) ? items : []
        setResumes(available)
        setSelectedResumeId(available[0]?.id || '')
      })
      .catch((requestError) => { if (active) setResumeError(requestError.message || 'Could not load your resumes.') })
      .finally(() => { if (active) setResumeLoading(false) })
    return () => { active = false }
  }, [])

  async function sendMessage(message, history = messages, appendUser = true, resumeId = selectedResumeId) {
    const content = message.trim()
    if (!content || sending) return

    setSending(true)
    setError('')
    setFailedRequest(null)
    if (appendUser) setMessages((current) => [...current, { role: 'user', content }])

    try {
      const result = await apiRequest('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: content,
          history: history.slice(-10).map(({ role, content: itemContent }) => ({ role, content: itemContent })),
          resumeId: resumeId || null,
        }),
      })
      setMessages((current) => [...current, { role: 'assistant', content: result.answer }])
      setDraft('')
      requestAnimationFrame(() => endOfMessages.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    } catch (requestError) {
      const message = requestError.message || 'Could not reach your career coach. Please retry.'
      setError(requestError.requestId ? `${message} (Reference: ${requestError.requestId})` : message)
      setFailedRequest({ content, history, resumeId })
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    void sendMessage(draft)
  }

  function startNewChat() {
    if (sending) return
    setMessages([])
    setDraft('')
    setError('')
    setFailedRequest(null)
  }

  function changeResume(resumeId) {
    if (sending) return
    setSelectedResumeId(resumeId)
    setMessages([])
    setError('')
    setFailedRequest(null)
  }

  return (
    <section className="ai-analysis">
      <header className="ai-analysis-heading">
        <div>
          <p className="resume-kicker">YOUR PERSONAL CAREER GUIDE</p>
          <h1>Career coach</h1>
          <p>Get practical guidance on your resume, skills, projects, and the next step in your job search.</p>
        </div>
        {messages.length > 0 && <button type="button" className="ai-new-chat" onClick={startNewChat} disabled={sending}>New chat</button>}
      </header>

      <div className="ai-chat-panel">
        <div className="ai-resume-context">
          <label htmlFor="ai-resume-select">Resume context</label>
          <select id="ai-resume-select" value={selectedResumeId} onChange={(event) => changeResume(event.target.value)} disabled={resumeLoading || sending}>
            <option value="">No resume — general chat</option>
            {resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.originalFilename}</option>)}
          </select>
          <span>{resumeLoading ? 'Loading your resumes…' : resumeError || (selectedResumeId ? 'The selected resume will be included in your chat.' : 'Select a resume to ask questions about its content.')}</span>
        </div>
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <span className="ai-spark" aria-hidden="true">✦</span>
            <h2>What would you like help with?</h2>
            <p>Bring a career question, explore your strengths, or get a practical plan for your next move.</p>
            <div className="ai-suggestions">
              {suggestions.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)} disabled={sending}>
                  <span aria-hidden="true">↗</span>{suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-messages" aria-live="polite">
            {messages.map((item, index) => (
              <article className={`ai-message ${item.role}`} key={`${item.role}-${index}`}>
                <span className="ai-message-avatar" aria-hidden="true">{item.role === 'assistant' ? '✦' : 'U'}</span>
                <div className="ai-message-body">
                  <strong>{item.role === 'assistant' ? 'SkillBit AI Coach' : 'You'}</strong>
                  <MarkdownMessage content={item.content} />
                </div>
              </article>
            ))}
            {sending && <div className="ai-thinking" role="status"><span className="ai-spinner"/> Checking your question…</div>}
            <div ref={endOfMessages} />
          </div>
        )}

        {error && (
          <div className="ai-feedback" role="alert">
            <span>{error}</span>
            {failedRequest && <button type="button" onClick={() => void sendMessage(failedRequest.content, failedRequest.history, false, failedRequest.resumeId)} disabled={sending}>Retry</button>}
          </div>
        )}

        <form className="ai-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="ai-prompt">Message your career coach</label>
          <textarea
            id="ai-prompt"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSubmit(event) } }}
            placeholder="Ask about your career goals, skills, or projects…"
            maxLength={3000}
            rows={2}
            disabled={sending}
          />
          <div className="ai-composer-footer">
            <span>Repository questions use GitHub’s read-only tools and your selected repositories.</span>
            <button type="submit" disabled={sending || !draft.trim()} aria-label={sending ? 'Sending message' : 'Send message'}>
              {sending ? 'Working…' : 'Send'} <span aria-hidden="true">↑</span>
            </button>
          </div>
        </form>
        <p className="ai-privacy-note">When a resume is selected, its extracted text is sent to Groq with your message. GitHub questions use the account linked to your SkillBit AI login.</p>
      </div>
    </section>
  )
}
