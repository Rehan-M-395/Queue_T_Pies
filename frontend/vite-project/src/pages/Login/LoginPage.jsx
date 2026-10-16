import { useSearchParams } from 'react-router-dom'
import AuthForm from '../../components/AuthForm'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const initialPortal = searchParams.get('portal') === 'admin' ? 'admin' : 'user'
  return <AuthForm mode="login" initialPortal={initialPortal} />
}
