import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Arrow, Brand } from '../../components/Brand'

export default function HomePage() {
  const { user, signOut } = useAuth()
  const admin = user && ['admin', 'hr'].includes(String(user.role).toLowerCase())

  async function handleSignOut() {
    await signOut().catch(() => {})
  }

  return (
    <main className="site-shell min-h-screen bg-queue-paper text-[#30443a]">
      <header className="topbar sticky top-0 z-10 bg-queue-paper/95 backdrop-blur">
        <Brand />
        <nav className="header-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#for-everyone">For everyone</a></nav>
        <div className="header-actions">{user ? <><Link className="login-link" to={admin ? '/admin' : '/dashboard'}>Hi, {user.name}</Link><button className="button button-small" onClick={handleSignOut}>Log out</button></> : <><Link className="login-link" to="/login">Log in</Link><Link className="button button-small" to="/signup">Sign up <Arrow /></Link></>}</div>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> YOUR AI-POWERED CAREER COACH</div>
          <h1>Make your next<br />career move<br /><span>with a plan.</span></h1>
          <p className="hero-description">Turn your resume, skills, and projects into a practical plan. Get thoughtful career guidance and find opportunities that fit where you want to go.</p>
          <div className="hero-actions"><Link className="button button-primary" to="/signup">Build your career plan <Arrow /></Link><a className="text-link" href="#how-it-works">Explore the toolkit <span>↓</span></a></div>
          <div className="trust-row"><div className="avatar-stack" aria-hidden="true"><i>R</i><i>S</i><i>P</i><i>AI</i></div><p><strong>Your skills. Your story. Your next move.</strong><br />One workspace to keep growing.</p></div>
        </div>

        <div className="hero-art" aria-label="Illustration of people moving toward new career opportunities">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-label label-top"><span className="label-icon">↗</span><span>YOUR NEXT<br /><b>CAREER MOVE</b></span></div>
          <div className="art-label label-bottom"><span className="label-check">✓</span><span>SKILLS<br /><b>IN FOCUS</b></span></div>
          <svg className="people-illustration" viewBox="0 0 590 560" role="img" aria-label="A team stepping along a path toward new opportunities">
            <defs><linearGradient id="sun" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f8c970"/><stop offset="1" stopColor="#f7a94e"/></linearGradient><linearGradient id="path" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9eddf"/><stop offset="1" stopColor="#a9d4ba"/></linearGradient></defs>
            <circle cx="340" cy="250" r="168" fill="#e5efe0"/><circle cx="368" cy="219" r="115" fill="url(#sun)"/>
            <path d="M40 450c125-102 210-90 288-19 62 56 154 48 230-3v132H40z" fill="url(#path)"/><path d="M40 465c116-76 183-62 271-3 57 39 147 38 247-12" fill="none" stroke="#79a68c" strokeWidth="3" strokeDasharray="7 10"/>
            <path d="m132 365 19-93 30-49 27 17-16 47 30 49-9 96h-70z" fill="#ef8265"/><circle cx="167" cy="199" r="22" fill="#9c5d46"/><path d="M145 198c0-26 37-34 48-9l-3 13-42 2z" fill="#403f53"/><path d="m162 309 37 10 29 61-18 8-42-49z" fill="#f4c58f"/><path d="m208 374 28 12 14 10-12 8-37-7z" fill="#344d4a"/>
            <path d="m268 328 20-104 33-45 31 17-18 50 31 57-11 104h-81z" fill="#476e82"/><circle cx="308" cy="174" r="24" fill="#d69a78"/><path d="M285 169c3-29 46-34 53-4l-8 12-44 1z" fill="#292f3d"/><path d="m286 269 47 11 28 63-21 8-47-45z" fill="#d69a78"/><path d="m340 341 25 8 14 14-13 10-37-10z" fill="#334a50"/>
            <path d="m401 385 17-85 30-40 28 18-13 41 25 43-9 71h-66z" fill="#c79bc1"/><circle cx="437" cy="248" r="21" fill="#e9b88b"/><path d="M416 247c2-25 38-31 48-8l-5 11-42 4z" fill="#665568"/><path d="m415 326 40 8 24 51-18 9-38-35z" fill="#e9b88b"/><path d="m460 382 25 8 14 13-14 8-34-11z" fill="#46505a"/>
            <path d="M75 170h77M60 191h50M435 106h58M450 126h39" stroke="#718577" strokeWidth="3" strokeLinecap="round"/><circle cx="94" cy="122" r="5" fill="#dc8962"/><circle cx="491" cy="193" r="6" fill="#658d73"/><path d="m519 273 7 7 14-17" fill="none" stroke="#62856c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="art-caption"><span className="caption-star">✳</span><span>Grow with purpose.<br /><b>Go further.</b></span></div>
          <span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✦</span>
        </div>
        <div className="hero-index"><span>01</span><i /> A LITTLE LESS WAITING. A LOT MORE GOING.</div>
      </section>

      <section className="audience-section" id="for-everyone"><div className="section-kicker">YOUR CAREER, ALL IN ONE WORKSPACE</div><div className="audience-heading"><h2>From knowing your strengths<br /><span>to finding what’s next.</span></h2><p>Practical tools and personal AI guidance to help you turn your experience into forward momentum.</p></div><div className="audience-cards">
        <article className="audience-card card-user"><div className="card-number">01 <span>UNDERSTAND YOUR STRENGTHS</span></div><div className="card-symbol">✦</div><h3>Make your skills<br />stand out.</h3><p>Review your resume, surface your skills, and get evidence-based feedback on the projects in your GitHub portfolio.</p><Link to="/signup" className="card-cta">Explore your career toolkit <Arrow /></Link></article>
        <article className="audience-card card-admin"><div className="card-number">02 <span>PLAN YOUR NEXT MOVE</span></div><div className="card-symbol">↗</div><h3>Find a role that<br />fits your goals.</h3><p>Explore job and internship listings, compare role requirements with your skills, and ask your AI career coach what to do next.</p><Link to="/signup" className="card-cta">Start planning your next step <Arrow /></Link></article>
      </div></section>

      <section className="how-section" id="how-it-works"><div><span className="section-kicker">A CLEARER PATH STARTS HERE</span><h2>Know your strengths.<br /><span>Choose your next step.</span></h2></div><p>Bring your resume, skills, portfolio, and job search together. SkillBit AI helps you turn career questions into a plan you can act on.</p><Link className="button button-primary" to="/signup">Meet your career coach <Arrow /></Link></section>
      <footer className="footer"><Brand /><span>Your next move, made clearer.</span><span>© 2026 SkillBit AI</span></footer>
    </main>
  )
}
