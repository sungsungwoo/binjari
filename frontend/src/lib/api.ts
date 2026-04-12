import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from './authStorage'

const LOGIN_PATH = '/auth/login'

function sessionExpiredRedirect(useAuth: boolean): void {
  if (!useAuth) return
  clearAccessToken()
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (path === LOGIN_PATH) return
  window.location.replace(LOGIN_PATH)
}

type RefreshTokenResponse = {
  success: true
  data: { tokens: { access_token: string; token_type: 'bearer' } }
}

/** 동시 401 시 리프레시 요청 1회로 합침 */
let refreshInFlight: Promise<boolean> | null = null

/**
 * httpOnly refresh 쿠키(path `/api/v1/auth`)로 액세스 토큰만 갱신.
 * 성공 시 localStorage 갱신 + 구독자(AuthContext) 동기화.
 */
export function refreshAccessTokenWithCookie(): Promise<boolean> {
  if (!refreshInFlight) {
    const p = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: '{}',
        })
        const data: unknown = await res.json().catch(() => ({}))
        if (!res.ok) return false
        const token = (data as Partial<RefreshTokenResponse>)?.data?.tokens
          ?.access_token
        if (typeof token !== 'string' || !token) return false
        setAccessToken(token)
        return true
      } catch {
        return false
      }
    })()
    refreshInFlight = p.finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/** refresh 쿠키를 서버에서 무효화하고 브라우저에서 제거(Set-Cookie). 로그아웃 시 필수. */
export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    })
  } catch {
    // 네트워크 실패 시에도 클라이언트 측 정리는 signOut에서 수행
  }
}

async function fetchWithAuthRetry(
  path: string,
  init: {
    method: string
    useAuth: boolean
    headers?: Record<string, string>
    body?: string
  },
): Promise<Response> {
  const { method, useAuth, headers: extraHeaders, body } = init
  const run = () =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...extraHeaders, ...authHeaders(useAuth) },
      credentials: 'include',
      body,
    })
  let res = await run()
  if (res.status === 401 && useAuth && (await refreshAccessTokenWithCookie())) {
    res = await run()
  }
  return res
}

/**
 * 개발(DEV)에서는 기본값이 빈 문자열 → `/api/...` 로 요청해 Vite 프록시(같은 origin)를 탄다.
 * 이때 `Set-Cookie`(refresh_token)가 페이지와 같은 호스트에 저장되어 DevTools에서 보인다.
 * 크로스 오리진으로 직접 백엔드를 부르면 localhost vs 127.0.0.1 혼용 시 쿠키가 안 붙을 수 있다.
 */
function resolveApiBase(): string {
  const v = import.meta.env.VITE_API_BASE_URL
  if (typeof v === 'string' && v.trim() !== '') {
    return v.trim().replace(/\/$/, '')
  }
  if (import.meta.env.DEV) {
    return ''
  }
  // 프로덕션: Caddy/nginx 뒤에서 같은 호스트로 /api 호출 (Docker·AWS 등)
  // 로컬에서 빌드만 검증할 때는 VITE_API_BASE_URL=http://127.0.0.1:8000 등으로 지정
  return ''
}

export const API_BASE = resolveApiBase()

export type AuthSuccessResponse = {
  success: true
  data: {
    user: {
      id: string
      email: string
      name: string
      provider: string
      is_active: boolean
      host_request_status?: string | null
      created_at: string
      updated_at: string
    }
    tokens: { access_token: string; token_type: 'bearer' }
  }
}

type ApiErrorJson = {
  success?: false
  error_code?: string
  message?: string
}

function authHeaders(useAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (useAuth) {
    const t = getAccessToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  return headers
}

async function parseError(res: Response, data: unknown): Promise<never> {
  const err = data as ApiErrorJson
  throw new Error(err.message ?? `요청에 실패했습니다. (${res.status})`)
}

async function finishResponse<T>(
  res: Response,
  data: unknown,
  useAuth: boolean
): Promise<T> {
  if (res.ok) return data as T
  if (res.status === 401) sessionExpiredRedirect(useAuth)
  return await parseError(res, data)
}

export function buildQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

export async function apiGetJson<T>(
  pathWithQuery: string,
  options?: { auth?: boolean }
): Promise<T> {
  const useAuth = options?.auth !== false
  const res = await fetchWithAuthRetry(pathWithQuery, {
    method: 'GET',
    useAuth,
  })
  const data: unknown = await res.json().catch(() => ({}))
  return finishResponse<T>(res, data, useAuth)
}

export async function apiPostJson<T>(
  path: string,
  body: unknown,
  options?: { auth?: boolean; idempotencyKey?: string }
): Promise<T> {
  const useAuth = options?.auth !== false
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options?.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }
  const res = await fetchWithAuthRetry(path, {
    method: 'POST',
    useAuth,
    headers,
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => ({}))
  return finishResponse<T>(res, data, useAuth)
}

export async function apiPatchJson<T>(
  path: string,
  body: unknown,
  options?: { auth?: boolean }
): Promise<T> {
  const useAuth = options?.auth !== false
  const res = await fetchWithAuthRetry(path, {
    method: 'PATCH',
    useAuth,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => ({}))
  return finishResponse<T>(res, data, useAuth)
}

export async function apiDelete(
  path: string,
  options?: { auth?: boolean }
): Promise<void> {
  const useAuth = options?.auth !== false
  const res = await fetchWithAuthRetry(path, { method: 'DELETE', useAuth })
  if (res.status === 204) return
  const data: unknown = await res.json().catch(() => ({}))
  await finishResponse<void>(res, data, useAuth)
}

export function googleOAuthUrl(): string {
  const path = '/api/v1/auth/google'
  return API_BASE ? `${API_BASE}${path}` : path
}
