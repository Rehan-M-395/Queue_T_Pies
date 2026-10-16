import { DashboardLayout } from '../../components/DashboardLayout'

export default function UserDashboardPage() {
  return (
    <DashboardLayout>
      <section className="dashboard-welcome">
        <p className="section-kicker">YOUR QUEUE_T_PIES SPACE</p>
        <h1>Your next step<br /><span>starts here.</span></h1>
        <p>Your account is ready. This is where your opportunities and activity will appear.</p>
        <div className="dashboard-placeholder"><span>✳</span><div><h2>More is on the way</h2><p>Your personal dashboard will grow here as Queue_T_pies features are added.</p></div></div>
      </section>
    </DashboardLayout>
  )
}
