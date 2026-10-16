import { useRef, useState } from 'react'
import { apiRequest } from '../../api'
import './AIAnalysis.css'

const suggestions = [
  'Which of my selected repositories use Go?',
  'What technologies appear across my repositories?',
  'How can I improve my projects for backend roles?',
]

export default function AIAnalysis() {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [failedRequest, setFailedRequest] = useState(null)
  const endOfMessages = useRef(null)

  async function sendMessage(message, history = messages, appendUser = true) {
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
        }),
      })
      setMessages((current) => [...current, { role: 'assistant', content: result.answer }])
      setDraft('')
      requestAnimationFrame(() => endOfMessages.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    } catch (requestError) {
      setError(requestError.message || 'Could not reach AI Analysis. Please retry.')
      setFailedRequest({ content, history })
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

  return (
    <section className="ai-analysis">
      <header className="ai-analysis-heading">
        <div>
          <p className="resume-kicker">CAREER WORKSPACE</p>
          <h1>AI Analysis</h1>
          <p>Ask about your selected GitHub repositories or get career guidance.</p>
        </div>
        {messages.length > 0 && <button type="button" className="ai-new-chat" onClick={startNewChat} disabled={sending}>New chat</button>}
      </header>

      <div className="ai-chat-panel">
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <span className="ai-spark" aria-hidden="true">✦</span>
            <h2>What would you like to explore?</h2>
            <p>Ask a career question or ask about technologies in the GitHub repositories you selected.</p>
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
                  <strong>{item.role === 'assistant' ? 'Queue_T_Pies AI' : 'You'}</strong>
                  <p>{item.content}</p>
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
            {failedRequest && <button type="button" onClick={() => void sendMessage(failedRequest.content, failedRequest.history, false)} disabled={sending}>Retry</button>}
          </div>
        )}

        <form className="ai-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="ai-prompt">Message AI Analysis</label>
          <textarea
            id="ai-prompt"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSubmit(event) } }}
            placeholder="Ask about your code, skills, or career…"
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
        <p className="ai-privacy-note">Your message and GitHub request are processed by Groq. GitHub access uses the account linked to your Queue_T_Pies login.</p>
      </div>
    </section>
  )
}
