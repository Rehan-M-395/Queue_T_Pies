import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { useAuth } from '../../hooks/useAuth'
import JobSearch from './JobSearch'
import ResumeManager from './ResumeManager'
import GitHubAnalysis from './GitHubAnalysis'

export default function UserDashboardPage() {
  const [activeSection, setActiveSection] = useState(() => new URLSearchParams(window.location.search).has('github') ? 'GitHub Analysis' : 'Home')
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
        <div className="sidebar-section-label">YOUR WORKSPACE</div>
        <nav className="user-sidebar-nav" aria-label="User sections">
          <button className={activeSection === 'Home' ? 'active' : ''} onClick={() => setActiveSection('Home')} aria-current={activeSection === 'Home' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">⌂</span><span className="sidebar-nav-label">Home</span>
          </button>
          <button className={activeSection === 'Resume' ? 'active' : ''} onClick={() => setActiveSection('Resume')} aria-current={activeSection === 'Resume' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">▤</span><span className="sidebar-nav-label">Resume</span>
          </button>
          <button className={activeSection === 'Edit profile' ? 'active' : ''} onClick={() => setActiveSection('Edit profile')} aria-current={activeSection === 'Edit profile' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">◉</span><span className="sidebar-nav-label">Edit profile</span>
          </button>
          <button className={activeSection === 'GitHub Analysis' ? 'active' : ''} onClick={() => setActiveSection('GitHub Analysis')} aria-current={activeSection === 'GitHub Analysis' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">⌘</span><span className="sidebar-nav-label">GitHub Analysis</span>
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
        {activeSection === 'Home' && <JobSearch />}
        {activeSection === 'Resume' && <ResumeManager />}
        {activeSection === 'Edit profile' && <div className="profile-placeholder">Profile editing will be available here.</div>}
        {activeSection === 'GitHub Analysis' && <GitHubAnalysis />}
      </section>
    </main>
  )
}
