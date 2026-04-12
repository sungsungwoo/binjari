import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGetJson, apiPostJson } from '../../lib/api'
import '../page-shell.css'
import './host-services.css'
import './host-service-dashboard.css'

type Booking = {
  id: string
  status: string
  created_at: string
  request_message: string | null
}

type Booker = {
  name: string
  email: string
} | null

type DetailRes = {
  success: true
  data: { booking: Booking; booker: Booker }
}

const STATUS_KO: Record<string, string> = {
  PENDING: '승인 대기',
  CONFIRMED: '확정',
  REJECTED: '거절',
  CANCELLED: '취소',
  NO_SHOW: '노쇼',
  COMPLETED: '완료',
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
    case 'CONFIRMED':
      return 'border-[color:var(--binjari-primary-border)] bg-[var(--binjari-primary-subtle)] text-[color:var(--binjari-primary-hover)] dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
    case 'REJECTED':
    case 'CANCELLED':
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
  }
}

export function HostBookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [data, setData] = useState<DetailRes['data'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!bookingId) return
    const res = await apiGetJson<DetailRes>(`/api/v1/host/bookings/${bookingId}`)
    setData(res.data)
  }

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    setError(null)
    setData(null)
    ;(async () => {
      try {
        const res = await apiGetJson<DetailRes>(
          `/api/v1/host/bookings/${bookingId}`,
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

  async function approve() {
    if (!bookingId) return
    setBusy(true)
    setError(null)
    try {
      await apiPostJson(`/api/v1/host/bookings/${bookingId}/approve`, {})
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '승인 실패')
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (!bookingId || !rejectReason.trim()) {
      setError('거절 사유를 입력하세요.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiPostJson(`/api/v1/host/bookings/${bookingId}/reject`, {
        reason: rejectReason.trim(),
      })
      setRejectReason('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '거절 실패')
    } finally {
      setBusy(false)
    }
  }

  const b = data?.booking
  const booker = data?.booker

  if (!bookingId) return null

  return (
    <div className="page-shell hs-page">
      <div className="hsd-back">
        <Link className="page-shell__link" to="/host/bookings">
          ← 예약 요청 목록
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              예약 처리
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              요청 내용을 확인한 뒤 승인하거나 거절할 수 있습니다.
            </p>
          </div>
          {b ? (
            <span
              className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusPillClass(b.status)}`}
            >
              {STATUS_KO[b.status] ?? b.status}
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="mt-5 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        {!b && !error ? (
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
            불러오는 중…
          </p>
        ) : null}

        {b ? (
          <div className="mt-6 space-y-3">
            {booker ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600 dark:bg-slate-900/40">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  예약자
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {booker.name}
                </p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {booker.email}
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-600">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                신청 일시
              </p>
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                {new Date(b.created_at).toLocaleString('ko-KR')}
              </p>
            </div>

            {b.request_message?.trim() ? (
              <div className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-600">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  요청 내용
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                  {b.request_message.trim()}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 dark:border-slate-600">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  추가로 남긴 요청 메시지가 없습니다.
                </p>
              </div>
            )}

            {b.status === 'PENDING' ? (
              <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-600">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="binjari-btn-solid inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-50"
                    onClick={() => void approve()}
                    disabled={busy}
                  >
                    승인
                  </button>
                </div>
                <div>
                  <label
                    htmlFor="rej"
                    className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"
                  >
                    거절 사유
                  </label>
                  <textarea
                    id="rej"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full max-w-lg rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none ring-offset-2 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-600"
                    placeholder="거절 시 사유를 입력하세요."
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => void reject()}
                  disabled={busy}
                >
                  거절
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
