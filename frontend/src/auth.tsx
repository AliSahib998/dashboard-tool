import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Spin } from 'antd'
import { api, type Me, type Role } from './api'

interface AuthState {
  user: Me | null
  setUser: (u: Me | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  if (loading) {
    return <Spin fullscreen />
  }
  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function hasRole(user: Me | null, ...roles: Role[]) {
  return !!user && roles.includes(user.role)
}

export function canEdit(user: Me | null) {
  return hasRole(user, 'ADMIN', 'ANALYST')
}
