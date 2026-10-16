import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function RequireAuth({ children, portal }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <main className="route-loading" aria-live="polite">Loading your account…</main>
  if (!user) return <Navigate to={portal === 'admin' ? '/login?portal=admin' : '/login'} replace state={{ from: location }} />

  const isAdmin = ['admin', 'hr'].includes(String(user.role).toLowerCase())
  if (portal === 'admin' && !isAdmin) return <Navigate to="/dashboard" replace />
  if (portal === 'user' && isAdmin) return <Navigate to="/admin" replace />
  return children
}
