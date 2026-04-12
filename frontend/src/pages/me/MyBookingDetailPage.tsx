import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetJson, apiPostJson } from '../../lib/api'
import '../page-shell.css'

type Booking = {
  id: string
  status: string
  created_at: string
  request_message: string | null
}

type DetailRes = {
  success: true
  data: { booking: Booking; can_cancel: boolean }
}

type CancelRes = { success: true; data: { booking: Booking } }

const STATUS_KO: Record<string, string> = {
  PENDING: '승인 대기',
  CONFIRMED: '확정',
  REJECTED: '거절됨',
  CANCELLED: '취소됨',
  NO_SHOW: '노쇼',
  COMPLETED: '완료',
}

export function MyBookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [data, setData] = useState<DetailRes['data'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<DetailRes>(
          `/api/v1/me/bookings/${bookingId}`
        )
        if (!cancelled) setData(res.data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '불러오기 실패')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  async function cancel() {
    if (!bookingId || !data?.can_cancel) return
    if (!confirm('예약을 취소할까요?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiPostJson<CancelRes>(
        `/api/v1/me/bookings/${bookingId}/cancel`,
        {}
      )
      setData({
        booking: res.data.booking,
        can_cancel: false,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setBusy(false)
    }
  }

  const b = data?.booking

  return (
    <div className="page-shell">
      <h1 className="page-shell__title">예약 상세</h1>
      <div className="page-shell__actions">
        <Link className="page-shell__link" to="/me/bookings">
          목록
        </Link>
      </div>
      {error ? <div className="page-shell__error">{error}</div> : null}
      {b ? (
        <div className="page-shell__card">
          <p className="page-shell__card-title">
            {STATUS_KO[b.status] ?? b.status}
          </p>
          <p className="page-shell__muted">신청 {new Date(b.created_at).toLocaleString()}</p>
          {b.request_message ? (
            <p style={{ marginTop: '0.75rem' }}>{b.request_message}</p>
          ) : null}
          {data.can_cancel ? (
            <button
              type="button"
              className="page-shell__btn"
              style={{ marginTop: '1rem' }}
              onClick={() => void cancel()}
              disabled={busy}
            >
              {busy ? '처리 중…' : '예약 취소'}
            </button>
          ) : null}
        </div>
      ) : !error ? (
        <p className="page-shell__muted">불러오는 중…</p>
      ) : null}
    </div>
  )
}
