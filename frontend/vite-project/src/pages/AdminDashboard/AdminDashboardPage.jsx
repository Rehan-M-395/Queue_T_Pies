import { DashboardLayout } from '../../components/DashboardLayout'

export default function AdminDashboardPage() {
  return (
    <DashboardLayout>
      <section className="dashboard-welcome">
        <p className="section-kicker">QUEUE_T_PIES ADMINISTRATION</p>
        <h1>Keep things<br /><span>in motion.</span></h1>
        <p>Your Admin / HR workspace is ready.</p>
        <div className="dashboard-placeholder"><span>↗</span><div><h2>Admin tools are coming next</h2><p>Account management and queue controls will be organized here.</p></div></div>
      </section>
    </DashboardLayout>
  )
}
