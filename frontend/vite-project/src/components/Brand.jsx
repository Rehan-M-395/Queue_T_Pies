import { Link } from 'react-router-dom'

export function Arrow() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
}

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
}

export function Brand({ to = '/' }) {
  return <Link className="brand" to={to} aria-label="Queue_T_pies home"><BrandMark /><span>Queue<span className="brand-accent">_T_pies</span></span></Link>
}

export default Brand

