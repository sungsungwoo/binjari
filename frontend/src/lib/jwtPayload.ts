/** Access JWT 페이로드 디코딩(검증 없음). UI·라우트 가드용. */
export type AccessTokenPayload = {
  sub?: string
  email?: string
  roles?: string[]
  /** Unix seconds (JWT 표준) */
  exp?: number
}

export function decodeAccessTokenPayload(
  token: string | null
): AccessTokenPayload | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = atob(b64 + pad)
    const o = JSON.parse(json) as Record<string, unknown>
    const rolesRaw = o.roles
    const roles = Array.isArray(rolesRaw)
      ? rolesRaw.map((x) => String(x))
      : undefined
    const expRaw = o.exp
    const exp =
      typeof expRaw === 'number'
        ? expRaw
        : typeof expRaw === 'string'
          ? Number(expRaw)
          : undefined
    return {
      sub: o.sub != null ? String(o.sub) : undefined,
      email: o.email != null ? String(o.email) : undefined,
      roles,
      exp: Number.isFinite(exp) ? exp : undefined,
    }
  } catch {
    return null
  }
}

/** `exp`가 없으면 클라이언트에서는 만료로 보지 않는다(서버 401에 맡김). */
export function isAccessTokenExpired(token: string | null): boolean {
  if (!token) return true
  const exp = decodeAccessTokenPayload(token)?.exp
  if (exp == null) return false
  return Date.now() >= exp * 1000
}
