import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAccessTokenExpired } from '../lib/jwtPayload'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { accessToken, signOut } = useAuth()
  const loc = useLocation()

  useEffect(() => {
    if (accessToken && isAccessTokenExpired(accessToken)) {
      void signOut()
    }
  }, [accessToken, signOut])

  if (!accessToken || isAccessTokenExpired(accessToken)) {
    return <Navigate to="/auth/login" replace state={{ from: loc }} />
  }
  return <Outlet />
}
