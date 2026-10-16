import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function GuestOnly({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <main className="route-loading" aria-live="polite">Restoring your session…</main>
  if (user) {
    const isAdmin = ['admin', 'hr'].includes(String(user.role).toLowerCase())
    return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />
  }
  return children
}
