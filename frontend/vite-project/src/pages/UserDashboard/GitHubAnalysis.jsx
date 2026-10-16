import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../api'
import './GitHubAnalysis.css'

export default function GitHubAnalysis() {
  const [status, setStatus] = useState(null)
  const [repositories, setRepositories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('github') && new URLSearchParams(window.location.search).get('github') !== 'connected'
    ? new URLSearchParams(window.location.search).get('github') === 'invalid_state' ? 'GitHub authorization expired or could not be validated. Please try again.' : 'GitHub authorization did not complete. Check the GitHub App configuration and retry.'
    : '')
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).get('github') === 'connected' ? 'GitHub connected. Select repositories to analyze.' : '')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const connection = await apiRequest('/api/github/status')
      setStatus(connection)
      if (connection.connected) {
        const result = await apiRequest('/api/github/repositories')
        setRepositories(result.repositories || [])
      } else setRepositories([])
    } catch (loadError) {
      setError(loadError.message || 'Could not load GitHub connection status.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get('github')
    if (result) {
      params.delete('github')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
    void Promise.resolve().then(load)
  }, [load])

  async function connectGitHub() {
    setError('')
    try {
      const result = await apiRequest('/api/github/oauth/start', { method: 'POST', body: JSON.stringify({}) })
      window.location.assign(result.authorizationUrl)
    } catch (connectError) { setError(connectError.message || 'Could not start GitHub authorization.') }
  }

  function toggleRepository(id) {
    setRepositories((current) => current.map((repo) => repo.id === id ? { ...repo, selected: !repo.selected } : repo))
  }

  async function saveSelection() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const selected = repositories.filter((repo) => repo.selected).map((repo) => repo.id)
      await apiRequest('/api/github/repositories/selection', { method: 'PUT', body: JSON.stringify({ repositoryIds: selected }) })
      setStatus((current) => ({ ...current, selectedCount: selected.length }))
      setNotice('Repository selection saved.')
    } catch (saveError) { setError(saveError.message || 'Could not save your repository selection.') }
    finally { setSaving(false) }
  }

  return (
    <section className="github-analysis">
      <header className="github-heading">
        <p className="resume-kicker">CAREER WORKSPACE</p>
        <h1>GitHub Analysis</h1>
        <p>Connect your GitHub account and choose repositories for future skills analysis.</p>
      </header>
      {error && <div className="github-message error" role="alert"><span>{error}</span><button onClick={load}>Retry</button></div>}
      {notice && <p className="github-message success" role="status">{notice}</p>}
      {loading ? <div className="github-state" role="status">Checking GitHub connection…</div> : !status?.connected ? (
        <div className="github-connect-card">
          <span className="github-mark" aria-hidden="true">⌘</span>
          <div><h2>Connect your GitHub account</h2><p>Your authorization stays linked to this Queue_T_Pies account. Tokens are stored encrypted on the backend.</p></div>
          <button className="github-primary" onClick={connectGitHub}>Connect GitHub</button>
        </div>
      ) : (
        <>
          <div className="github-connected-card"><span className="github-connected-dot"/><span>Connected as <strong>@{status.githubLogin}</strong></span><span className="github-selected-count">{repositories.filter((repo) => repo.selected).length} selected</span><button onClick={load}>Refresh</button></div>
          <div className="github-repositories-heading"><div><h2>Your repositories</h2><p>Choose the repositories you want included in your analysis.</p></div><button className="github-primary" onClick={saveSelection} disabled={saving}>{saving ? 'Saving…' : 'Save selection'}</button></div>
          {repositories.length === 0 ? <div className="github-state">No accessible repositories were found for this GitHub account.</div> : (
            <ul className="github-repository-list">
              {repositories.map((repo) => <li key={repo.id}>
                <label className="github-repository">
                  <input type="checkbox" checked={repo.selected} onChange={() => toggleRepository(repo.id)} />
                  <span className="github-repository-copy"><strong>{repo.full_name}</strong><span>{repo.description || 'No description provided.'}</span><small>{repo.language || 'Language not specified'} · {repo.private ? 'Private' : 'Public'}{repo.default_branch ? ` · ${repo.default_branch}` : ''}</small></span>
                </label>
                <a href={repo.html_url} target="_blank" rel="noreferrer" aria-label={`Open ${repo.full_name} on GitHub`}>↗</a>
              </li>)}
            </ul>
          )}
          <p className="github-attribution">Repository data is provided by GitHub. Analysis will use only the repositories you select.</p>
        </>
      )}
    </section>
  )
}
