import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Arrow, BrandMark } from './Brand'

export default function AuthForm({ mode, initialPortal = 'user' }) {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()
  const [portal, setPortal] = useState(initialPortal)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'
  const isAdminPortal = portal === 'admin'

  async function submit(event) {
    event.preventDefault()
    setNotice('')
    if (isSignup && isAdminPortal) {
      setNotice('Admin / HR accounts must be provisioned by an administrator. Sign in if you already have access.')
      return
    }
    setBusy(true)
    try {
      const user = isSignup
        ? await signUp({ name, email, password })
        : await signIn({ email, password, portal })
      const destination = ['admin', 'hr'].includes(String(user.role).toLowerCase()) ? '/admin' : '/dashboard'
      navigate(destination, { replace: true })
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy(false)
    }
  }

  const targetMode = isSignup ? 'login' : 'signup'
  const targetPath = targetMode === 'login' && isAdminPortal ? '/login?portal=admin' : `/${targetMode}`

  return (
    <main className="auth-page">
      <Link className="auth-home-brand" to="/"><BrandMark /><span>SkillBit<span className="brand-accent"> AI</span></span></Link>
      <section className="auth-dialog auth-route-card" aria-labelledby="auth-title">
        <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
        <h1 id="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="dialog-subtitle">{isSignup ? 'Create your SkillBit AI career workspace.' : 'Sign in to pick up where you left off.'}</p>
        <div className="role-picker" aria-label="Choose account type">
          <button className={!isAdminPortal ? 'selected' : ''} onClick={() => setPortal('user')} type="button">User / Employer</button>
          <button className={isAdminPortal ? 'selected' : ''} onClick={() => setPortal('admin')} type="button">Admin / HR</button>
        </div>
        <form onSubmit={submit}>
          {isSignup && <label>Full name<input autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}
          <label>Email address<input autoComplete="email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input autoComplete={isSignup ? 'new-password' : 'current-password'} type="password" placeholder="At least 8 characters" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="button button-primary submit-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'} <Arrow /></button>
        </form>
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <p className="switch-mode">{isSignup ? 'Already have an account?' : 'New to SkillBit AI?'} <Link to={targetPath}>{isSignup ? 'Sign in' : 'Create account'}</Link></p>
        <p className="terms">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
      </section>
    </main>
  )
}
