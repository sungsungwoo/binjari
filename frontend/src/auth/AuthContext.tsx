import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { logoutSession, refreshAccessTokenWithCookie } from '../lib/api'
import {
  decodeAccessTokenPayload,
  isAccessTokenExpired,
} from '../lib/jwtPayload'
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken as persistAccessToken,
  subscribeAccessTokenChange,
} from '../lib/authStorage'

type AuthContextValue = {
  accessToken: string | null
  setAccessToken: (token: string | null) => void
  signOut: () => Promise<void>
  roles: string[]
  isHost: boolean
  isAdmin: boolean
  userId: string | null
  userEmail: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [accessToken, setToken] = useState<string | null>(() =>
    getAccessToken()
  )

  const setAccessToken = useCallback((token: string | null) => {
    if (token) persistAccessToken(token)
    else clearAccessToken()
    setToken(token)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const t = getAccessToken()
      if (t && !isAccessTokenExpired(t)) return
      const ok = await refreshAccessTokenWithCookie()
      if (cancelled) return
      if (ok) {
        setToken(getAccessToken())
        return
      }
      if (t && isAccessTokenExpired(t)) {
        clearAccessToken()
        setToken(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return subscribeAccessTokenChange(() => {
      setToken(getAccessToken())
    })
  }, [])

  const signOut = useCallback(async () => {
    await logoutSession()
    clearAccessToken()
    setToken(null)
    navigate('/auth/login', { replace: true })
  }, [navigate])

  const { roles, isHost, isAdmin, userId, userEmail } = useMemo(() => {
    const payload = decodeAccessTokenPayload(accessToken)
    const r = payload?.roles ?? []
    return {
      roles: r,
      isHost: r.includes('HOST'),
      isAdmin: r.includes('ADMIN'),
      userId: payload?.sub ?? null,
      userEmail: payload?.email ?? null,
    }
  }, [accessToken])

  const value = useMemo(
    () => ({
      accessToken,
      setAccessToken,
      signOut,
      roles,
      isHost,
      isAdmin,
      userId,
      userEmail,
    }),
    [accessToken, setAccessToken, signOut, roles, isHost, isAdmin, userId, userEmail]
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

/* eslint-disable react-refresh/only-export-components -- 훅은 Provider와 같은 모듈에 둠 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  }
  return ctx
}
