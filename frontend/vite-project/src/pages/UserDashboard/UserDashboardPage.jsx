import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { useAuth } from '../../hooks/useAuth'
import JobSearch from './JobSearch'
import ResumeManager from './ResumeManager'
import GitHubAnalysis from './GitHubAnalysis'
import AIAnalysis from './AIAnalysis'

export default function UserDashboardPage() {
  const [activeSection, setActiveSection] = useState(() => new URLSearchParams(window.location.search).has('github') ? 'GitHub Portfolio' : 'Career home')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [logoutError, setLogoutError] = useState('')
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    setLogoutError('')
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      setLogoutError('Could not log out. Check your connection and try again.')
    }
  }

  return (
    <main className="user-dashboard">
      <aside className={`user-sidebar${sidebarOpen ? '' : ' is-collapsed'}`} aria-label="User dashboard sidebar">
        <div className="sidebar-heading">
          <Brand />
          <button className="sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'} aria-expanded={sidebarOpen} title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}>
            <span aria-hidden="true">{sidebarOpen ? '‹' : '›'}</span>
          </button>
        </div>
        <div className="sidebar-section-label">YOUR CAREER WORKSPACE</div>
        <nav className="user-sidebar-nav" aria-label="User sections">
          <button className={activeSection === 'Career home' ? 'active' : ''} onClick={() => setActiveSection('Career home')} aria-current={activeSection === 'Career home' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">⌂</span><span className="sidebar-nav-label">Career home</span>
          </button>
          <button className={activeSection === 'Resume' ? 'active' : ''} onClick={() => setActiveSection('Resume')} aria-current={activeSection === 'Resume' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">▤</span><span className="sidebar-nav-label">Resume insights</span>
          </button>
          <button className={activeSection === 'GitHub Portfolio' ? 'active' : ''} onClick={() => setActiveSection('GitHub Portfolio')} aria-current={activeSection === 'GitHub Portfolio' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">⌘</span><span className="sidebar-nav-label">GitHub portfolio</span>
          </button>
          <button className={activeSection === 'Career Coach' ? 'active' : ''} onClick={() => setActiveSection('Career Coach')} aria-current={activeSection === 'Career Coach' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">✦</span><span className="sidebar-nav-label">AI chat</span>
          </button>
        </nav>
        <div className="sidebar-account">
          <div className="account-avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div className="account-copy"><strong>{user?.name}</strong><span>{user?.email}</span></div>
        </div>
        <button className="sidebar-logout" onClick={handleSignOut} aria-label="Log out"><span aria-hidden="true">↗</span><span className="sidebar-logout-label">Log out</span></button>
        {logoutError && <p className="logout-error" role="alert">{logoutError}</p>}
      </aside>
      <section className="user-content-canvas" aria-label={`${activeSection} workspace`}>
        {activeSection === 'Career home' && <JobSearch />}
        {activeSection === 'Resume' && <ResumeManager />}
        {activeSection === 'GitHub Portfolio' && <GitHubAnalysis />}
        {activeSection === 'Career Coach' && <AIAnalysis />}
      </section>
    </main>
  )
}
