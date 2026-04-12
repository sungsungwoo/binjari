import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { apiGetJson } from '../../lib/api'
import '../page-shell.css'

type ListRes = {
  success: true
  data: { items: { id: string; title: string; slug: string }[] }
}

export function HostDashboardPage() {
  const [items, setItems] = useState<ListRes['data']['items'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<ListRes>('/api/v1/host/booking-pages')
        if (!cancelled) setItems(res.data.items)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (items === null && !error) {
    return (
      <div className="page-shell">
        <h1 className="page-shell__title">호스트 홈</h1>
        <p className="page-shell__muted">불러오는 중…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-shell">
        <h1 className="page-shell__title">호스트 홈</h1>
        <div className="page-shell__error">{error}</div>
        <Link className="page-shell__link" to="/host/services">
          예약 페이지 목록
        </Link>
      </div>
    )
  }

  const n = items?.length ?? 0
  if (n === 0) {
    return (
      <div className="page-shell">
        <h1 className="page-shell__title">호스트 홈</h1>
        <p className="page-shell__lead">
          예약 페이지가 없습니다. 첫 페이지를 만들면 여기서 바로 관리할 수 있어요.
        </p>
        <Link className="page-shell__btn" to="/host/services/new">
          내 예약 페이지 만들기
        </Link>
        <p style={{ marginTop: '1rem' }}>
          <Link className="page-shell__link" to="/host/services">
            목록 화면으로
          </Link>
        </p>
      </div>
    )
  }

  if (n === 1 && items![0]) {
    return <Navigate to={`/host/services/${items![0].slug}/dashboard`} replace />
  }

  return <Navigate to="/host/services" replace />
}
