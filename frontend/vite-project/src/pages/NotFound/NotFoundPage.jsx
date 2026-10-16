import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return <main className="not-found"><p className="section-kicker">404 · PAGE NOT FOUND</p><h1>This page isn’t in the queue.</h1><Link className="button button-primary" to="/">Back to home</Link></main>
}
