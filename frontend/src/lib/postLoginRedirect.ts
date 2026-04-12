import { decodeAccessTokenPayload } from './jwtPayload'

/** Member 기본 진입 (내 예약) */
export const DEFAULT_MEMBER_PATH = '/me/bookings'

/** Host 기본 진입 (예약 페이지 목록) */
export const DEFAULT_HOST_PATH = '/host/services'

/** Admin 기본 진입 (운영·가입 심사) */
export const DEFAULT_ADMIN_PATH = '/admin'

export type LoginFromState = { pathname: string; search?: string }

/**
 * 로그인/가입 직후 이동 경로.
 * - ADMIN → `/admin`
 * - HOST → 기본 `/host/services`. 단, 공개 예약 `/book/...`에서 로그인으로 온 경우만 그 페이지로 복귀(호스트가 타인 페이지를 예약할 때).
 * - 그 외: `from`이 있으면 해당 경로, 없으면 Member 기본.
 */
export function resolvePostLoginPath(
  accessToken: string,
  from: LoginFromState | null | undefined,
): string {
  const roles = decodeAccessTokenPayload(accessToken)?.roles ?? []
  if (roles.includes('ADMIN')) return DEFAULT_ADMIN_PATH
  if (roles.includes('HOST')) {
    const p = from?.pathname ?? ''
    if (p.startsWith('/book/')) {
      return `${p}${from?.search ?? ''}`
    }
    return DEFAULT_HOST_PATH
  }
  if (from?.pathname != null) {
    return `${from.pathname}${from.search ?? ''}`
  }
  return DEFAULT_MEMBER_PATH
}

/**
 * JWT `roles` 기준 로그인 직후 기본 경로 (`from` 없을 때와 동일).
 * 우선순위: ADMIN → HOST → Member
 */
export function postLoginDefaultPath(accessToken: string): string {
  return resolvePostLoginPath(accessToken, null)
}
