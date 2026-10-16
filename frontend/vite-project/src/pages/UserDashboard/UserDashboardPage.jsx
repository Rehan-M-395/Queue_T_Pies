import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { useAuth } from '../../hooks/useAuth'

export default function UserDashboardPage() {
  const [activeSection, setActiveSection] = useState('Resume')
  const { user, signOut } = useAuth()

  async function handleSignOut() {
    await signOut().catch(() => {})
  }

  return (
    <main className="user-dashboard">
      <aside className="user-sidebar" aria-label="User dashboard sidebar">
        <Brand />
        <div className="sidebar-section-label">YOUR WORKSPACE</div>
        <nav className="user-sidebar-nav" aria-label="User sections">
          <button className={activeSection === 'Resume' ? 'active' : ''} onClick={() => setActiveSection('Resume')} aria-current={activeSection === 'Resume' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">▤</span> Resume
          </button>
          <button className={activeSection === 'Edit profile' ? 'active' : ''} onClick={() => setActiveSection('Edit profile')} aria-current={activeSection === 'Edit profile' ? 'page' : undefined}>
            <span className="sidebar-icon" aria-hidden="true">◉</span> Edit profile
          </button>
        </nav>
        <div className="sidebar-account">
          <div className="account-avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div className="account-copy"><strong>{user?.name}</strong><span>{user?.email}</span></div>
          <button className="account-logout" onClick={handleSignOut} aria-label="Log out" title="Log out">↗</button>
        </div>
        <Link className="sidebar-home-link" to="/">← Back to home</Link>
      </aside>
      <section className="user-content-canvas" aria-label={`${activeSection} workspace`} />
    </main>
  )
}
