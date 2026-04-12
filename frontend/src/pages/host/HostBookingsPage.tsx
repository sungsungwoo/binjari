import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiGetJson, buildQuery } from '../../lib/api'
import '../page-shell.css'
import './host-services.css'
import './host-service-dashboard.css'

type Booking = {
  id: string
  status: string
  created_at: string
  booker_name?: string | null
}

type ListRes = { success: true; data: { items: Booking[] } }

const STATUS_KO: Record<string, string> = {
  PENDING: '승인 대기',
  CONFIRMED: '확정',
  REJECTED: '거절',
  CANCELLED: '취소',
  NO_SHOW: '노쇼',
  COMPLETED: '완료',
}

export function HostBookingsPage() {
  const [searchParams] = useSearchParams()
  const hostSettingId = searchParams.get('hostSettingId') ?? ''
  const [items, setItems] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<ListRes>(
          `/api/v1/host/bookings${buildQuery({
            status: status || undefined,
            hostSettingId: hostSettingId || undefined,
          })}`,
        )
        if (!cancelled) setItems(res.data.items)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '불러오기 실패')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, hostSettingId])

  const backTo = hostSettingId
    ? `/host/services/${hostSettingId}/dashboard`
    : '/host/dashboard'
  const backLabel = hostSettingId
    ? '← 예약 페이지 대시보드'
    : '← 호스트 대시보드'

  return (
    <div className="page-shell hs-page">
      <div className="hsd-back">
        <Link className="page-shell__link" to={backTo}>
          {backLabel}
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              예약 요청
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              들어온 예약을 확인하고 승인하거나 거절합니다.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="hb-filter"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500"
          >
            상태 필터
          </label>
          <select
            id="hb-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1.5 block w-full max-w-xs rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus:ring-slate-600"
          >
            <option value="">전체</option>
            <option value="PENDING">대기</option>
            <option value="CONFIRMED">확정</option>
            <option value="REJECTED">거절</option>
            <option value="CANCELLED">취소</option>
          </select>
        </div>

        {error ? (
          <p className="mt-5 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}

        {items === null && !error ? (
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
            불러오는 중…
          </p>
        ) : null}

        {items?.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
            표시할 예약이 없습니다.
          </p>
        ) : null}

        {items && items.length > 0 ? (
          <div className="mt-5 space-y-3">
            {items.map((b) => (
              <Link
                key={b.id}
                to={`/host/bookings/${b.id}`}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 px-4 py-4 transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {STATUS_KO[b.status] ?? b.status}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {b.booker_name?.trim()
                      ? `${b.booker_name.trim()} · `
                      : ''}
                    {new Date(b.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-500"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
