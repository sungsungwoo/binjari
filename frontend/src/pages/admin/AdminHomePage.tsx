import { useCallback, useEffect, useState } from 'react'
import { apiGetJson, apiPostJson } from '../../lib/api'
import '../page-shell.css'

type PendingItem = {
  id: string
  email: string
  name: string
  host_request_status: 'pending'
  created_at: string
}

type ListRes = {
  success: true
  data: { items: PendingItem[] }
}

type ActionRes = {
  success: true
  data: { user: { id: string; host_request_status: string | null } }
}

export function AdminHomePage() {
  const [items, setItems] = useState<PendingItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await apiGetJson<ListRes>('/api/v1/admin/host-requests', {
        auth: true,
      })
      const list = res?.data?.items
      setItems(Array.isArray(list) ? list : [])
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function approve(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await apiPostJson<ActionRes>(
        `/api/v1/admin/host-requests/${id}/approve`,
        {},
        { auth: true },
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '승인 처리에 실패했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await apiPostJson<ActionRes>(
        `/api/v1/admin/host-requests/${id}/reject`,
        {},
        { auth: true },
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '반려 처리에 실패했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page-shell">
      <h1 className="page-shell__title">운영자 · 호스트 신청</h1>
      <p className="page-shell__lead">
        호스트로 가입한 사용자의 승인·반려를 처리합니다. 승인 시 즉시 HOST 권한이
        부여되며, 사용자는 다음 토큰 갱신(또는 재로그인) 후 호스트 메뉴를 쓸 수
        있습니다.
      </p>
      {error ? (
        <div className="page-shell__error">
          {error}
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="page-shell__btn page-shell__btn--ghost"
              onClick={() => void load()}
            >
              다시 시도
            </button>
          </div>
          <p className="page-shell__muted" style={{ marginTop: '0.75rem' }}>
            관리자 메뉴는 보이는데 목록만 안 나오면, 로그아웃 후 관리자 계정으로 다시
            로그인하거나 브라우저를 새로고침해 보세요.
          </p>
        </div>
      ) : null}
      {loading ? (
        <p className="page-shell__muted">목록을 불러오는 중…</p>
      ) : null}
      {!loading && !error && items?.length === 0 ? (
        <p className="page-shell__muted">대기 중인 호스트 신청이 없습니다.</p>
      ) : null}
      {!loading && items && items.length > 0 ? (
        <ul className="page-shell__list" style={{ listStyle: 'none', padding: 0 }}>
          {items.map((u) => (
            <li
              key={u.id}
              className="page-shell__card"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div>
                <strong>{u.name}</strong>
                <span className="page-shell__muted"> · {u.email}</span>
                <p className="page-shell__muted" style={{ margin: '0.25rem 0 0' }}>
                  신청일 {new Date(u.created_at).toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="page-shell__btn"
                  disabled={busyId === u.id}
                  onClick={() => void approve(u.id)}
                >
                  승인
                </button>
                <button
                  type="button"
                  className="page-shell__btn page-shell__btn--ghost"
                  disabled={busyId === u.id}
                  onClick={() => void reject(u.id)}
                >
                  반려
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
