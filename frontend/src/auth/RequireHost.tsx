import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { postLoginDefaultPath } from '../lib/postLoginRedirect'
import { isAccessTokenExpired } from '../lib/jwtPayload'
import { useAuth } from './AuthContext'

export function RequireHost() {
  const { accessToken, isHost, signOut } = useAuth()
  const loc = useLocation()

  useEffect(() => {
    if (accessToken && isAccessTokenExpired(accessToken)) {
      void signOut()
    }
  }, [accessToken, signOut])

  if (!accessToken || isAccessTokenExpired(accessToken)) {
    return <Navigate to="/auth/login" replace state={{ from: loc }} />
  }
  if (!isHost) {
    return <Navigate to={postLoginDefaultPath(accessToken)} replace />
  }
  return <Outlet />
}
