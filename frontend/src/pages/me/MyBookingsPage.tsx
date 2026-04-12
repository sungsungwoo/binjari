import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  Ticket,
  X,
  XCircle,
} from 'lucide-react'
import { apiGetJson, apiPostJson } from '../../lib/api'

type MeRes = {
  success: true
  data: { host_request_status?: string | null }
}

type Booking = {
  id: string
  status: string
  slot_id: string
  created_at: string
}

type ListRes = {
  success: true
  data: { items: Booking[]; next_cursor: string | null }
}

type DetailBooking = {
  id: string
  status: string
  created_at: string
  request_message: string | null
}

type DetailRes = {
  success: true
  data: { booking: DetailBooking; can_cancel: boolean }
}

type CancelRes = { success: true; data: { booking: DetailBooking } }

const STATUS_KO: Record<string, string> = {
  PENDING: '승인 대기',
  CONFIRMED: '확정',
  REJECTED: '거절됨',
  CANCELLED: '취소됨',
  NO_SHOW: '노쇼',
  COMPLETED: '완료',
}

type FilterKey = 'ALL' | 'PENDING' | 'CONFIRMED' | 'DONE' | 'CLOSED'

const FILTER_LABEL: Record<FilterKey, string> = {
  ALL: '전체',
  PENDING: '승인 대기',
  CONFIRMED: '확정',
  DONE: '완료',
  CLOSED: '취소/거절',
}

function formatDateTime(value: string) {
  const d = new Date(value)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function matchesFilter(status: string, filter: FilterKey) {
  switch (filter) {
    case 'ALL':
      return true
    case 'PENDING':
      return status === 'PENDING'
    case 'CONFIRMED':
      return status === 'CONFIRMED'
    case 'DONE':
      return status === 'COMPLETED'
    case 'CLOSED':
      return ['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(status)
    default:
      return true
  }
}

function badgeClass(status: string) {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
    case 'CONFIRMED':
      return 'bg-[var(--binjari-primary-subtle)] text-[color:var(--binjari-primary-hover)] ring-1 ring-[color:var(--binjari-primary-border)]'
    case 'COMPLETED':
      return 'bg-indigo-50 text-indigo-800 ring-indigo-200'
    case 'CANCELLED':
    case 'REJECTED':
    case 'NO_SHOW':
      return 'bg-slate-100 text-slate-800 ring-slate-200'
    default:
      return 'bg-slate-50 text-slate-800 ring-slate-200'
  }
}

function statusGuide(status: string) {
  switch (status) {
    case 'PENDING':
      return '호스트의 승인 결과를 기다리는 중입니다.'
    case 'CONFIRMED':
      return '예약이 확정되었습니다. 상세에서 취소 가능 여부와 요청 메시지를 확인하세요.'
    case 'COMPLETED':
      return '이 예약은 이용이 완료되었습니다.'
    case 'CANCELLED':
      return '취소된 예약입니다.'
    case 'REJECTED':
      return '호스트가 예약을 승인하지 않았습니다.'
    case 'NO_SHOW':
      return '예약 시간에 방문하지 않은 기록입니다.'
    default:
      return '상세에서 예약 정보를 확인하세요.'
  }
}

function summaryFromItems(items: Booking[]) {
  const closed =
    items.filter((x) => x.status === 'COMPLETED').length +
    items.filter((x) =>
      ['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(x.status),
    ).length
  return {
    total: items.length,
    pending: items.filter((x) => x.status === 'PENDING').length,
    confirmed: items.filter((x) => x.status === 'CONFIRMED').length,
    closed,
  }
}

export function MyBookingsPage() {
  const [items, setItems] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostPending, setHostPending] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [detailModalId, setDetailModalId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<DetailRes['data'] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [bookingsRes, meRes] = await Promise.all([
          apiGetJson<ListRes>('/api/v1/me/bookings'),
          apiGetJson<MeRes>('/api/v1/users/me'),
        ])
        if (!cancelled) {
          setItems(bookingsRes.data.items)
          setHostPending(meRes.data.host_request_status === 'pending')
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '불러오기 실패')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!detailModalId) {
      setDetailData(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetailData(null)
    ;(async () => {
      try {
        const res = await apiGetJson<DetailRes>(
          `/api/v1/me/bookings/${detailModalId}`,
        )
        if (!cancelled) setDetailData(res.data)
      } catch (e) {
        if (!cancelled) {
          setDetailError(
            e instanceof Error ? e.message : '상세를 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailModalId])

  useEffect(() => {
    if (!detailModalId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailModalId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailModalId])

  const closeDetailModal = useCallback(() => {
    setDetailModalId(null)
    setDetailData(null)
    setDetailError(null)
  }, [])

  async function cancelBooking() {
    if (!detailModalId || !detailData?.can_cancel) return
    if (!confirm('예약을 취소할까요?')) return
    setCancelBusy(true)
    setDetailError(null)
    try {
      const res = await apiPostJson<CancelRes>(
        `/api/v1/me/bookings/${detailModalId}/cancel`,
        {},
      )
      const updated = res.data.booking
      setDetailData({
        booking: updated,
        can_cancel: false,
      })
      setItems((prev) =>
        prev
          ? prev.map((row) =>
              row.id === updated.id
                ? {
                    ...row,
                    status: updated.status,
                    created_at: updated.created_at,
                  }
                : row,
            )
          : null,
      )
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setCancelBusy(false)
    }
  }

  const summary = useMemo(
    () => (items ? summaryFromItems(items) : null),
    [items],
  )

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter((b) => matchesFilter(b.status, filter))
  }, [items, filter])

  const loading = items === null && !error

  return (
    <div className="min-h-screen bg-[var(--binjari-bg)] text-[color:var(--binjari-text-heading)]">
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            내 예약
          </h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600">
            예약 현황을 한눈에 보고, 상태별로 빠르게 찾을 수 있습니다.
          </p>
        </header>

        {hostPending ? (
          <div className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 shadow-sm">
            호스트 가입 신청이 <strong>관리자 승인 대기</strong> 중입니다. 승인되면
            새로고침하거나 잠시 후 다시 로그인하면 호스트 메뉴가 표시됩니다.
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : summary ? (
          <>
            <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: '전체 예약',
                  value: `${summary.total}건`,
                  icon: Ticket,
                },
                {
                  label: '승인 대기',
                  value: `${summary.pending}건`,
                  icon: Clock3,
                },
                {
                  label: '확정',
                  value: `${summary.confirmed}건`,
                  icon: CheckCircle2,
                },
                {
                  label: '종료/취소',
                  value: `${summary.closed}건`,
                  icon: XCircle,
                },
              ].map((card) => {
                const Icon = card.icon
                return (
                  <div
                    key={card.label}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-500">
                        {card.label}
                      </p>
                      <div className="rounded-2xl bg-slate-50 p-2 text-slate-500">
                        <Icon className="h-4 w-4" aria-hidden />
                      </div>
                    </div>
                    <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                      {card.value}
                    </p>
                  </div>
                )
              })}
            </section>

            <section className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500">
                <Filter className="h-4 w-4" aria-hidden />
                상태별 보기
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FILTER_LABEL) as FilterKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      filter === key
                        ? 'binjari-btn-solid text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {FILTER_LABEL[key]}
                  </button>
                ))}
              </div>
            </section>

            {filtered.length === 0 ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <CalendarDays className="h-6 w-6" aria-hidden />
                </div>
                <h2 className="mt-4 text-xl font-semibold">
                  표시할 예약이 없습니다
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  선택한 상태에 해당하는 예약이 없거나, 아직 신청한 예약이 없습니다.
                </p>
                <Link
                  to="/"
                  className="binjari-btn-solid mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-[var(--binjari-shadow-btn)]"
                >
                  서비스 둘러보기
                </Link>
              </section>
            ) : (
              <div className="grid gap-4">
                {filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setDetailModalId(b.id)}
                    className="group block w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badgeClass(b.status)}`}
                          >
                            {STATUS_KO[b.status] ?? b.status}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition group-hover:bg-slate-50 lg:self-center">
                        상세 보기
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium text-slate-500">
                          신청일
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatDateTime(b.created_at)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium text-slate-500">
                          예약 시간
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                          상세에서 확인
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium text-slate-500">
                          예약 번호
                        </p>
                        <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
                          {b.id}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {statusGuide(b.status)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      {detailModalId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetailModal()
          }}
        >
          <div
            className="max-h-[min(90vh,36rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="me-booking-detail-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="me-booking-detail-title"
                className="text-lg font-semibold text-slate-900"
              >
                예약 상세
              </h2>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="닫기"
                onClick={closeDetailModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <p className="mt-6 text-sm text-slate-500">불러오는 중…</p>
            ) : null}
            {detailError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {detailError}
              </div>
            ) : null}

            {detailData?.booking ? (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">상태</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {STATUS_KO[detailData.booking.status] ??
                      detailData.booking.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">신청일시</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {formatDateTime(detailData.booking.created_at)}
                  </p>
                </div>
                {detailData.booking.request_message?.trim() ? (
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      요청 메시지
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {detailData.booking.request_message.trim()}
                    </p>
                  </div>
                ) : null}
                {detailData.can_cancel ? (
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={() => void cancelBooking()}
                    className="binjari-btn-solid w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {cancelBusy ? '처리 중…' : '예약 취소'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  닫기
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
