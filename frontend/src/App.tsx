import { Navigate, Route, Routes } from 'react-router-dom'
import { Result } from 'antd'
import type { ReactNode } from 'react'
import { hasRole, useAuth } from './auth'
import type { Role } from './api'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import DashboardsList from './pages/DashboardsList'
import DashboardView from './pages/DashboardView'
import QuestionsList from './pages/QuestionsList'
import QueryEditor from './pages/QueryEditor'
import QuestionView from './pages/QuestionView'
import DataSources from './pages/admin/DataSources'
import Users from './pages/admin/Users'
import AuditLog from './pages/admin/AuditLog'

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!hasRole(user, ...roles)) {
    return <Result status="403" title="No access" subTitle="You do not have permission to open this page." />
  }
  return <>{children}</>
}

export default function App() {
  const { user } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboards" replace />} />
        <Route path="/dashboards" element={<DashboardsList />} />
        <Route path="/dashboards/:id" element={<DashboardView />} />
        <Route path="/questions" element={<QuestionsList />} />
        <Route path="/questions/:id" element={<QuestionView />} />
        <Route path="/questions/:id/edit" element={<RequireRole roles={['ADMIN', 'ANALYST']}><QueryEditor /></RequireRole>} />
        <Route path="/query" element={<RequireRole roles={['ADMIN', 'ANALYST']}><QueryEditor /></RequireRole>} />
        <Route path="/admin/datasources" element={<RequireRole roles={['ADMIN']}><DataSources /></RequireRole>} />
        <Route path="/admin/users" element={<RequireRole roles={['ADMIN']}><Users /></RequireRole>} />
        <Route path="/admin/audit" element={<RequireRole roles={['ADMIN']}><AuditLog /></RequireRole>} />
        <Route path="*" element={<Result status="404" title="Page not found" />} />
      </Route>
    </Routes>
  )
}
