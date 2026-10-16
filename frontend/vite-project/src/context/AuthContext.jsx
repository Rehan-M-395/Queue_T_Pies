import { useEffect, useState } from 'react'
import { apiRequest } from '../api'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me')
      .then(({ user: sessionUser }) => { if (active) setUser(sessionUser) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function signUp(details) {
    const { user: newUser } = await apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(details),
    })
    setUser(newUser)
    return newUser
  }

  async function signIn(details) {
    const { user: signedInUser } = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(details),
    })
    setUser(signedInUser)
    return signedInUser
  }

  async function signOut() {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>{children}</AuthContext.Provider>
}
