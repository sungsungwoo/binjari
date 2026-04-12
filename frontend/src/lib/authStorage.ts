const ACCESS_KEY = 'binjari_access_token'

type AccessTokenListener = () => void
const listeners = new Set<AccessTokenListener>()

/** api.ts 등에서 토큰을 갱신·삭제했을 때 AuthContext와 동기화 */
export function subscribeAccessTokenChange(
  cb: AccessTokenListener,
): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notifyAccessTokenChanged(): void {
  for (const cb of listeners) cb()
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_KEY, token)
  notifyAccessTokenChanged()
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_KEY)
  notifyAccessTokenChanged()
}
