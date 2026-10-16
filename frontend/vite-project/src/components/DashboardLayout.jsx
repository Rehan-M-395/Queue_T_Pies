import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Brand } from './Brand'

export function DashboardLayout({ children }) {
  const { user, signOut } = useAuth()

  async function handleSignOut() {
    await signOut().catch(() => {})
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar dashboard-topbar">
        <Brand />
        <div className="header-actions"><span className="login-link">{user?.name}</span><button className="button button-small" onClick={handleSignOut}>Log out</button></div>
      </header>
      <div className="dashboard-content">
        <Link className="dashboard-back" to="/">← Back to home</Link>
        {children}
      </div>
    </main>
  )
}

export default DashboardLayout
