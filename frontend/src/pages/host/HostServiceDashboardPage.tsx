import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGetJson, buildQuery } from '../../lib/api'
import { BookingPageCoverHero, resolveBookingCoverUrl } from './BookingPageCoverHero'
import '../page-shell.css'
import './host-services.css'
import './host-service-dashboard.css'

type Metrics = {
  rules_count: number
  open_slots_count: number
  today_bookings: number
  week_bookings: number
  pending_bookings: number
}

type PageRow = {
  id: string
  slug: string
  title: string
  description: string | null
  is_active: boolean
  is_listed: boolean
  listing_category: string | null
  setup_completed: boolean
  approval_type: string
  slot_duration_mins: number
  host_timezone: string
  metrics: Metrics
  cover_image_url?: string | null
}

type ListRes = { success: true; data: { items: PageRow[] } }

type SlotRead = {
  id: string
  host_setting_id: string
  start_time: string
  end_time: string
  status: 'OPEN' | 'BOOKED' | 'BLOCKED'
}

type HostBookingListItem = {
  id: string
  slot_id: string
  status: string
  request_message: string | null
  booker_name: string | null
  booker_email: string | null
}

type SlotsRes = { success: true; data: { items: SlotRead[] } }
type BookingsRes = { success: true; data: { items: HostBookingListItem[] } }

function extractSlotItems(raw: unknown): SlotRead[] {
  if (!raw || typeof raw !== 'object') return []
  const data = (raw as { data?: unknown }).data
  if (!data || typeof data !== 'object') return []
  const items = (data as { items?: unknown }).items
  return Array.isArray(items) ? (items as SlotRead[]) : []
}

function extractBookingItems(raw: unknown): HostBookingListItem[] {
  if (!raw || typeof raw !== 'object') return []
  const data = (raw as { data?: unknown }).data
  if (!data || typeof data !== 'object') return []
  const items = (data as { items?: unknown }).items
  return Array.isArray(items) ? (items as HostBookingListItem[]) : []
}

/** API마다 UUID 대소문자·하이픈 차이로 매칭 실패하는 경우 방지 */
function normId(id: string | undefined | null): string {
  if (id == null || id === '') return ''
  return String(id).replace(/-/g, '').toLowerCase()
}

/** IANA 타임존 검증 후 사용, 실패 시 브라우저 로컬 타임존 */
function resolveSafeTimeZone(timeZone: string | undefined | null): string {
  const raw = timeZone?.trim()
  if (raw) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date())
      return raw
    } catch {
      /* invalid IANA id */
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** 서버 `date.fromisoformat`용 YYYY-MM-DD (로케일에 따라 format만 쓰면 파싱 실패할 수 있음) */
function calendarDateInTimeZone(timeZone: string): string {
  const tz = resolveSafeTimeZone(timeZone)
  const d = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (y && m && day) return `${y}-${m}-${day}`
  return d.toISOString().slice(0, 10)
}

function formatTimeInTz(iso: string, timeZone: string): string {
  const tz = resolveSafeTimeZone(timeZone)
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  }
}

/** ISO 시각을 해당 타임존의 달력 날짜 YYYY-MM-DD로 */
function calendarDateFromIsoInTz(iso: string, tz: string): string {
  const t = resolveSafeTimeZone(tz)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: t,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (y && m && d) return `${y}-${m}-${d}`
  return ''
}

/** YYYY-MM-DD에 그레고리력 일수 더하기 (슬롯 조회 종료일 등) */
function addCalendarDaysFromYmd(ymd: string, add: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + add)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** YYYY-MM-DD → "4월 11일 (금)" (그레고리력 요일) */
function formatYmdHeadingKo(ymd: string): string {
  const [yy, mo, dd] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(yy, mo - 1, dd))
  const wk = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()]
  return `${mo}월 ${dd}일 (${wk})`
}

/** 승인 대기 카드용: 오늘/내일/M/D(요) + 시각 */
function formatPendingSlotWhen(
  startIso: string,
  hostTz: string,
  todayYmd: string,
): string {
  const tz = resolveSafeTimeZone(hostTz)
  const slotDay = calendarDateFromIsoInTz(startIso, tz)
  const hm = formatTimeInTz(startIso, hostTz).replace(/\u202f/g, '').trim()
  if (slotDay === todayYmd) return `오늘 ${hm}`
  const tomorrowYmd = addCalendarDaysFromYmd(todayYmd, 1)
  if (slotDay === tomorrowYmd) return `내일 ${hm}`
  const md = new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz,
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(startIso))
  const wk = new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date(startIso))
  return `${md}(${wk}) ${hm}`
}

type ScheduleRowState = 'booked' | 'open' | 'pending' | 'blocked'

type ScheduleRow = {
  key: string
  time: string
  title: string
  meta: string
  detail: string | null
  state: ScheduleRowState
  bookingId: string | null
}

function mergeTodaySchedule(
  slots: SlotRead[],
  bookings: HostBookingListItem[],
  timeZone: string,
): ScheduleRow[] {
  const active = new Map<string, HostBookingListItem>()
  for (const b of bookings) {
    if (b.status === 'PENDING' || b.status === 'CONFIRMED') {
      const k = normId(b.slot_id)
      if (k) active.set(k, b)
    }
  }
  const sorted = [...slots].sort((a, b) => {
    const ta = new Date(a.start_time).getTime()
    const tb = new Date(b.start_time).getTime()
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
    return ta - tb
  })
  return sorted.map((slot) => {
    const time = formatTimeInTz(String(slot.start_time), timeZone)
    const st = String(slot.status ?? 'OPEN')
      .trim()
      .toUpperCase() as SlotRead['status']
    if (st === 'OPEN') {
      return {
        key: slot.id,
        time,
        title: '비어 있음',
        meta: '예약 가능',
        detail: null,
        state: 'open',
        bookingId: null,
      }
    }
    if (st === 'BLOCKED') {
      return {
        key: slot.id,
        time,
        title: '차단됨',
        meta: '예약 불가',
        detail: null,
        state: 'blocked',
        bookingId: null,
      }
    }
    const b = active.get(normId(slot.id))
    if (!b) {
      return {
        key: slot.id,
        time,
        title: '예약 연결 확인 필요',
        meta: 'BOOKED',
        detail: '예약 관리 화면에서 상세를 확인해 주세요.',
        state: 'booked',
        bookingId: null,
      }
    }
    const name = b.booker_name?.trim() || '예약자'
    const isPending = b.status === 'PENDING'
    const msg = b.request_message?.trim()
    return {
      key: slot.id,
      time,
      title: isPending ? `${name} · 승인 대기` : `${name} · 예약 확정`,
      meta: isPending ? '승인 대기' : '예약 확정',
      detail: msg || null,
      state: isPending ? 'pending' : 'booked',
      bookingId: b.id,
    }
  })
}

function scheduleDotClass(state: ScheduleRowState) {
  if (state === 'booked') return 'bg-slate-900'
  if (state === 'pending') return 'bg-amber-400'
  if (state === 'blocked') return 'bg-slate-400'
  return 'binjari-ui-dot-open'
}

/** 목록 한 줄 요약 (예약 행은 title에 이름·상태가 이미 포함됨) */
function scheduleRowSummaryLine(item: ScheduleRow): string {
  if (item.state === 'pending' || item.state === 'booked') {
    return item.title
  }
  return `${item.title} · ${item.meta}`
}

function scheduleRowOpensBookingModal(item: ScheduleRow): boolean {
  return Boolean(
    item.bookingId &&
      (item.state === 'pending' || item.state === 'booked'),
  )
}

function pendingSummaryLines(count: number): string[] {
  if (count <= 0) return []
  if (count === 1) {
    return ['예약 요청 1건 · 승인을 진행해 주세요']
  }
  return Array.from(
    { length: Math.min(count, 4) },
    (_, i) => `예약 요청 ${i + 1} · 승인 대기`,
  )
}

export function HostServiceDashboardPage() {
  const { bookingSlug } = useParams<{ bookingSlug: string }>()
  const navigate = useNavigate()
  const [row, setRow] = useState<PageRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copyDone, setCopyDone] = useState(false)
  const [schedule, setSchedule] = useState<{
    loading: boolean
    error: string | null
    slots: SlotRead[]
    bookings: HostBookingListItem[]
  }>({
    loading: true,
    error: null,
    slots: [],
    bookings: [],
  })
  /** 일정 패널에서 보는 날짜 (호스트 타임존 기준 YYYY-MM-DD). 최초는 오늘. */
  const [dayViewYmd, setDayViewYmd] = useState('')
  /** 예약 확정·승인 대기 슬롯 클릭 시 상세 모달 */
  const [scheduleBookingModalId, setScheduleBookingModalId] = useState<
    string | null
  >(null)

  useEffect(() => {
    if (!row || !bookingSlug) return
    if (bookingSlug === row.id && row.slug !== bookingSlug) {
      navigate(`/host/services/${row.slug}/dashboard`, { replace: true })
    }
  }, [row, bookingSlug, navigate])

  useEffect(() => {
    if (!bookingSlug) return
    const key = bookingSlug.trim()
    const slugNorm = key.toLowerCase()
    let c = false
    ;(async () => {
      try {
        const res = await apiGetJson<ListRes>('/api/v1/host/booking-pages')
        if (c) return
        const found = res.data.items.find(
          (x) => x.slug.toLowerCase() === slugNorm || x.id === key,
        )
        setRow(found ?? null)
      } catch (e) {
        if (!c) {
          setError(e instanceof Error ? e.message : '불러오기 실패')
        }
      }
    })()
    return () => {
      c = true
    }
  }, [bookingSlug])

  useEffect(() => {
    if (!row) {
      setDayViewYmd('')
      return
    }
    setDayViewYmd(calendarDateInTimeZone(row.host_timezone))
  }, [row?.id])

  useEffect(() => {
    if (!row) return
    let cancelled = false
    const tz = row.host_timezone
    const todayYmd = calendarDateInTimeZone(tz)
    /** 한 번에 넓게 불러 두고 날짜 전환은 클라이언트 필터 (이전/다음 탐색 반응성) */
    const fromYmd = addCalendarDaysFromYmd(todayYmd, -30)
    const toYmd = addCalendarDaysFromYmd(todayYmd, 365)
    setSchedule({
      loading: true,
      error: null,
      slots: [],
      bookings: [],
    })
    ;(async () => {
      const results = await Promise.allSettled([
        apiGetJson<SlotsRes>(
          `/api/v1/host/booking-pages/${row.id}/slots${buildQuery({ from: fromYmd, to: toYmd })}`,
        ),
        apiGetJson<BookingsRes>(
          `/api/v1/host/bookings${buildQuery({ hostSettingId: row.id })}`,
        ),
      ])
      if (cancelled) return
      const slotRaw = results[0]
      const bookRaw = results[1]
      let slots: SlotRead[] = []
      let bookings: HostBookingListItem[] = []
      let errorMsg: string | null = null
      if (slotRaw.status === 'fulfilled') {
        slots = extractSlotItems(slotRaw.value)
      } else {
        const r = slotRaw.reason
        errorMsg =
          r instanceof Error
            ? r.message
            : '슬롯 일정을 불러오지 못했습니다.'
      }
      if (bookRaw.status === 'fulfilled') {
        bookings = extractBookingItems(bookRaw.value)
      }
      setSchedule({
        loading: false,
        error: errorMsg,
        slots,
        bookings,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [row])

  const bookUrl = row ? `${window.location.origin}/book/${row.slug}` : ''

  const slotsSelectedDay = useMemo(() => {
    if (!row || schedule.loading || !dayViewYmd) return []
    const tz = resolveSafeTimeZone(row.host_timezone)
    return schedule.slots.filter(
      (s) => calendarDateFromIsoInTz(String(s.start_time), tz) === dayViewYmd,
    )
  }, [row, schedule.slots, schedule.loading, dayViewYmd])

  const dayScheduleRows = useMemo(() => {
    if (!row || schedule.loading) return []
    try {
      return mergeTodaySchedule(
        slotsSelectedDay,
        schedule.bookings,
        row.host_timezone,
      )
    } catch {
      return slotsSelectedDay.map((s) => {
        const st = String(s.status ?? '').trim().toUpperCase()
        const state: ScheduleRowState =
          st === 'BLOCKED'
            ? 'blocked'
            : st === 'OPEN'
              ? 'open'
              : 'booked'
        return {
          key: String(s.id),
          time: formatTimeInTz(String(s.start_time), row.host_timezone),
          title:
            st === 'OPEN'
              ? '비어 있음'
              : st === 'BLOCKED'
                ? '차단됨'
                : '예약 있음',
          meta: st || '슬롯',
          detail: null,
          state,
          bookingId: null,
        }
      })
    }
  }, [row, schedule, slotsSelectedDay])

  const hostTodayYmd = useMemo(
    () => (row ? calendarDateInTimeZone(row.host_timezone) : ''),
    [row],
  )
  /** 슬롯 API 조회 구간(호스트 기준 오늘 ±) — 날짜만 바꿀 때는 재요청하지 않음 */
  const slotFetchRange = useMemo(() => {
    if (!hostTodayYmd) return null
    return {
      from: addCalendarDaysFromYmd(hostTodayYmd, -30),
      to: addCalendarDaysFromYmd(hostTodayYmd, 365),
    }
  }, [hostTodayYmd])
  const dayOutsideSlotFetchRange = Boolean(
    slotFetchRange &&
      dayViewYmd &&
      (dayViewYmd < slotFetchRange.from || dayViewYmd > slotFetchRange.to),
  )
  const isViewingToday = Boolean(
    dayViewYmd && hostTodayYmd && dayViewYmd === hostTodayYmd,
  )
  const scheduleSectionTitle = !dayViewYmd
    ? '일정'
    : isViewingToday
      ? '오늘 일정'
      : `${formatYmdHeadingKo(dayViewYmd)} 일정`
  const scheduleSectionSubtitle = !dayViewYmd
    ? '호스트 시간대 기준으로 슬롯을 시간순으로 표시합니다.'
    : isViewingToday
      ? '오늘의 모든 슬롯을 시간순으로 표시합니다. 예약이 있으면 이름과 요청 내용을 함께 보여줍니다.'
      : '선택한 날짜의 슬롯을 시간순으로 표시합니다. 예약이 있으면 이름과 요청 내용을 함께 보여줍니다.'

  /** 처리할 일: 이름 · 오늘/내일/M/D(요) 시각 예약 요청 */
  const pendingTodoItems = useMemo(() => {
    if (!row || schedule.loading) return []
    const todayYmd = calendarDateInTimeZone(row.host_timezone)
    const bySlot = new Map(
      schedule.slots.map((s) => [normId(s.id), s] as const),
    )
    return schedule.bookings
      .filter((b) => b.status === 'PENDING')
      .map((b) => {
        const slot = bySlot.get(normId(b.slot_id))
        const name = b.booker_name?.trim() || '예약자'
        const when = slot
          ? formatPendingSlotWhen(
              String(slot.start_time),
              row.host_timezone,
              todayYmd,
            )
          : '일정 확인 필요'
        return {
          bookingId: b.id,
          label: `${name} · ${when} 예약 요청`,
        }
      })
  }, [row, schedule])

  const scheduleBookingModalPayload = useMemo(() => {
    if (!scheduleBookingModalId) return null
    const booking = schedule.bookings.find(
      (b) => b.id === scheduleBookingModalId,
    )
    const sr = dayScheduleRows.find(
      (r) => r.bookingId === scheduleBookingModalId,
    )
    if (!booking || !sr) return null
    return { booking, row: sr }
  }, [scheduleBookingModalId, schedule.bookings, dayScheduleRows])

  useEffect(() => {
    if (!scheduleBookingModalId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setScheduleBookingModalId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scheduleBookingModalId])

  const draft = row ? !row.setup_completed : false
  const statusLabel = row
    ? draft
      ? '초안'
      : row.is_active
        ? '활성'
        : '비활성'
    : ''
  const visibilityLabel = row
    ? draft
      ? '설정 필요'
      : row.is_listed
        ? '공개중'
        : '비공개'
    : ''

  async function copyBookLink() {
    if (!bookUrl) return
    try {
      await navigator.clipboard.writeText(bookUrl)
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 2000)
    } catch {
      setCopyDone(false)
    }
  }

  if (!bookingSlug) return null

  return (
    <div className="page-shell hs-page">
      <div className="hsd-back">
        <Link className="page-shell__link" to="/host/services">
          ← 예약 페이지 목록
        </Link>
      </div>

      {error ? <div className="page-shell__error">{error}</div> : null}
      {!row && !error ? (
        <p className="page-shell__muted">찾는 페이지가 없습니다.</p>
      ) : null}

      {row ? (
        <>
          <article className="hs-card hsd-hero-card" aria-labelledby="hsd-hero-title">
            <div className="hs-card__hero">
              <BookingPageCoverHero
                seed={row.id + row.slug}
                imageUrl={resolveBookingCoverUrl(row)}
              />
              <div className="hs-card__hero-overlay" aria-hidden />
              <div className="hs-card__badges" aria-label="페이지 상태">
                <span
                  className={
                    draft
                      ? 'hs-pill hs-pill--draft'
                      : row.is_active
                        ? 'hs-pill hs-pill--active'
                        : 'hs-pill hs-pill--inactive'
                  }
                >
                  {statusLabel}
                </span>
                <span
                  className={
                    draft
                      ? 'hs-pill hs-pill--pending'
                      : row.is_listed
                        ? 'hs-pill hs-pill--listed'
                        : 'hs-pill hs-pill--unlisted'
                  }
                >
                  {visibilityLabel}
                </span>
              </div>
              <div className="hs-card__hero-text">
                <h1 id="hsd-hero-title" className="hs-card__hero-title">
                  {row.title}
                </h1>
                <p className="hs-card__hero-desc">
                  {row.description?.trim() ||
                    (!row.setup_completed
                      ? '운영 규칙과 슬롯 설정이 아직 완료되지 않았어요.'
                      : row.is_active
                        ? '예약을 받을 수 있는 페이지입니다.'
                        : '아직 공개되지 않은 예약 페이지입니다.')}
                </p>
              </div>
            </div>
            <div className="hs-card__footer">
              <div className="hs-card__footer-main">
                <div className="hs-card__footer-url">
                  <p className="hs-card__footer-url-label">공개 URL</p>
                  <p className="hs-card__footer-url-value">
                    <a
                      className="hs-card__footer-url-link"
                      href={bookUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {bookUrl}
                    </a>
                  </p>
                </div>
              </div>
              <div className="hs-card__footer-actions">
                <Link className="hs-card__chip" to={`/book/${row.slug}`}>
                  예약 페이지 보기
                </Link>
                <button
                  type="button"
                  className="hs-card__chip hs-card__chip--soft"
                  onClick={() => void copyBookLink()}
                >
                  {copyDone ? '복사됨' : '링크 복사'}
                </button>
                <Link
                  className="hs-card__chip hs-card__chip--soft"
                  to={`/host/services/${row.id}/edit`}
                >
                  편집
                </Link>
              </div>
            </div>
          </article>

          <div className="hsd-metric-grid">
            <div className="hsd-metric">
              <p className="hsd-metric__label">오늘 예약</p>
              <p className="hsd-metric__value">{row.metrics.today_bookings}건</p>
            </div>
            <div className="hsd-metric">
              <p className="hsd-metric__label">승인 대기</p>
              <p className="hsd-metric__value">
                {row.metrics.pending_bookings}건
              </p>
            </div>
            <div className="hsd-metric">
              <p className="hsd-metric__label">이번 주 예약</p>
              <p className="hsd-metric__value">{row.metrics.week_bookings}건</p>
            </div>
            <div className="hsd-metric">
              <p className="hsd-metric__label">열린 슬롯</p>
              <p className="hsd-metric__value">
                {row.metrics.open_slots_count}칸
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    {scheduleSectionTitle}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {scheduleSectionSubtitle}
                  </p>
                </div>
                <Link
                  className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  to={`/host/bookings${buildQuery({ hostSettingId: row.id })}`}
                >
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  예약 관리로 이동
                </Link>
              </div>

              {hostTodayYmd && dayViewYmd ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="이전 날"
                    onClick={() =>
                      setDayViewYmd(addCalendarDaysFromYmd(dayViewYmd, -1))
                    }
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <input
                    type="date"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[11rem]"
                    value={dayViewYmd}
                    onChange={(e) => {
                      const v = e.target.value
                      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setDayViewYmd(v)
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-label="다음 날"
                    onClick={() =>
                      setDayViewYmd(addCalendarDaysFromYmd(dayViewYmd, 1))
                    }
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() => setDayViewYmd(hostTodayYmd)}
                  >
                    오늘
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={() =>
                      setDayViewYmd(addCalendarDaysFromYmd(hostTodayYmd, 1))
                    }
                  >
                    내일
                  </button>
                </div>
              ) : null}

              {schedule.error ? (
                <p className="mt-5 text-sm text-red-600 dark:text-red-400">
                  {schedule.error}
                </p>
              ) : null}
              {schedule.loading ? (
                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  일정을 불러오는 중…
                </p>
              ) : null}
              {!schedule.loading &&
              !schedule.error &&
              dayScheduleRows.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                  {dayOutsideSlotFetchRange
                    ? '선택한 날짜가 현재 불러온 슬롯 범위(과거 약 30일~미래 약 1년) 밖입니다. 가까운 날짜를 선택해 보세요.'
                    : isViewingToday
                      ? '오늘 이 페이지에 생성된 슬롯이 없습니다. 슬롯 관리에서 일정을 만들어 보세요.'
                      : '선택한 날짜에 생성된 슬롯이 없습니다. 다른 날짜를 선택하거나 슬롯 관리에서 일정을 만들어 보세요.'}
                </p>
              ) : null}
              {!schedule.loading &&
              dayScheduleRows.length > 0 ? (
                <div className="mt-5 space-y-1.5">
                  {dayScheduleRows.map((item) => {
                    const openModal = scheduleRowOpensBookingModal(item)
                    const rowClass =
                      'flex w-full min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left transition dark:border-slate-600' +
                      (openModal
                        ? ' cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40'
                        : '')
                    const inner = (
                      <>
                        <div className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                          {item.time}
                        </div>
                        <div
                          className={`h-2 w-2 shrink-0 rounded-full ${scheduleDotClass(item.state as ScheduleRowState)}`}
                          aria-hidden
                        />
                        <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                          {scheduleRowSummaryLine(item)}
                        </p>
                        {openModal ? (
                          <ChevronRight
                            className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500"
                            aria-hidden
                          />
                        ) : (
                          <span
                            className="inline-block h-3 w-3 shrink-0"
                            aria-hidden
                          />
                        )}
                      </>
                    )
                    if (openModal && item.bookingId) {
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={rowClass}
                          onClick={() =>
                            setScheduleBookingModalId(item.bookingId)
                          }
                        >
                          {inner}
                        </button>
                      )
                    }
                    return (
                      <div key={item.key} className={rowClass}>
                        {inner}
                      </div>
                    )
                  })}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-900 dark:bg-slate-100" />
                  예약 확정
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="binjari-ui-dot-open h-2.5 w-2.5 shrink-0 rounded-full" />
                  예약 가능
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  승인 대기
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  차단
                </span>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    처리할 일
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    지금 바로 처리하면 좋은 작업이에요.
                  </p>
                </div>
                <div
                  className="rounded-2xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  aria-hidden
                >
                  <Clock3 className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {row.metrics.pending_bookings === 0 &&
                !schedule.loading &&
                pendingTodoItems.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-900/50">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      승인 대기 없음
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      새 요청이 들어오면 여기에 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          승인 대기{' '}
                          {schedule.loading
                            ? row.metrics.pending_bookings
                            : pendingTodoItems.length ||
                              row.metrics.pending_bookings}
                          건
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          예약 요청을 확인하고 승인 여부를 결정하세요.
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        확인 필요
                      </span>
                    </div>
                    {schedule.loading ? (
                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                        목록을 불러오는 중…
                      </p>
                    ) : pendingTodoItems.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {pendingTodoItems.map((item) => (
                          <li
                            key={item.bookingId}
                            className="rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800"
                          >
                            <Link
                              className="block px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60"
                              to={`/host/bookings/${item.bookingId}`}
                            >
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {pendingSummaryLines(row.metrics.pending_bookings).map(
                          (line, idx) => (
                            <li
                              key={`fb-${idx}-${line.slice(0, 32)}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {line}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {scheduleBookingModalPayload && row ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget)
                  setScheduleBookingModalId(null)
              }}
            >
              <div
                className="max-h-[min(90vh,32rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="hsd-booking-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div>
                  <p
                    id="hsd-booking-modal-title"
                    className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                  >
                    예약 정보
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {scheduleBookingModalPayload.row.time} ·{' '}
                    {scheduleBookingModalPayload.booking.status === 'PENDING'
                      ? '승인 대기'
                      : scheduleBookingModalPayload.booking.status ===
                          'CONFIRMED'
                        ? '예약 확정'
                        : scheduleBookingModalPayload.booking.status}
                  </p>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      예약자
                    </dt>
                    <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                      {scheduleBookingModalPayload.booking.booker_name?.trim() ||
                        '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      이메일
                    </dt>
                    <dd className="mt-0.5 break-all text-slate-900 dark:text-slate-100">
                      {scheduleBookingModalPayload.booking.booker_email?.trim() ||
                        '—'}
                    </dd>
                  </div>
                  {scheduleBookingModalPayload.booking.request_message?.trim() ? (
                    <div>
                      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        요청 내용
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200">
                        {scheduleBookingModalPayload.booking.request_message.trim()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-6">
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    onClick={() => setScheduleBookingModalId(null)}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
