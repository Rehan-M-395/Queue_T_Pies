import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import RequireAuth from './routes/RequireAuth'
import HomePage from './pages/Home/HomePage'
import LoginPage from './pages/Login/LoginPage'
import SignupPage from './pages/Signup/SignupPage'
import UserDashboardPage from './pages/UserDashboard/UserDashboardPage'
import AdminDashboardPage from './pages/AdminDashboard/AdminDashboardPage'
import NotFoundPage from './pages/NotFound/NotFoundPage'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/dashboard" element={<RequireAuth portal="user"><UserDashboardPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth portal="admin"><AdminDashboardPage /></RequireAuth>} />
      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
