import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Info,
  Sparkles,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  apiDelete,
  apiGetJson,
  apiPostJson,
  buildQuery,
} from '../lib/api'

type HostSetting = {
  id: string
  host_id: string
  title: string
  slug: string
  approval_type: string
  host_timezone: string
}

type OwnerBookingItem = {
  id: string
  slot_id: string
  status: string
  request_message: string | null
  booker_name: string | null
  booker_email: string | null
}

type OwnerBookingsRes = { success: true; data: { items: OwnerBookingItem[] } }

type Slot = {
  id: string
  start_time: string
  end_time: string
  status: string
}

type DayGroup = { date: string; slots: Slot[] }

type PageRes = { success: true; data: HostSetting }
type SlotsRes = { success: true; data: { days: DayGroup[] } }
type HoldRes = {
  success: true
  data: {
    held: boolean
    hold_token?: string | null
    remaining_seconds?: number | null
  }
}
type BookingRes = {
  success: true
  data: {
    booking: { id: string; status: string }
    message?: string | null
  }
}

type CalendarCell = {
  key: string
  date: number
  inMonth: boolean
  slots: Slot[]
  isToday: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dayKey(y: number, m0: number, d: number) {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`
}

function todayKeyNow() {
  const t = new Date()
  return dayKey(t.getFullYear(), t.getMonth(), t.getDate())
}

/** 호스트 타임존 기준 달력 날짜 키 (YYYY-MM-DD). 타임존 없으면 로컬 날짜. */
function calendarDateKeyInTimeZone(d: Date, timeZone: string | undefined) {
  if (!timeZone?.trim()) {
    return dayKey(d.getFullYear(), d.getMonth(), d.getDate())
  }
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return dayKey(d.getFullYear(), d.getMonth(), d.getDate())
  }
}

function formatTimeShort(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDayTitle(dateKey: string) {
  const [, mm, dd] = dateKey.split('-').map(Number)
  return `${mm}월 ${dd}일`
}

function slotDurationMinutes(s: Slot) {
  const a = new Date(s.start_time).getTime()
  const b = new Date(s.end_time).getTime()
  const m = Math.round((b - a) / 60000)
  return m > 0 ? m : 40
}

function buildMonthCells(
  year: number,
  monthIndex: number,
  daysFromApi: DayGroup[],
  todayK: string
): CalendarCell[] {
  const slotMap = new Map<string, Slot[]>(daysFromApi.map((g) => [g.date, g.slots]))
  const firstDow = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: CalendarCell[] = []

  const prev = new Date(year, monthIndex, 0)
  const py = prev.getFullYear()
  const pm = prev.getMonth()
  const dimPrev = prev.getDate()

  for (let i = 0; i < firstDow; i++) {
    const d = dimPrev - firstDow + i + 1
    const key = dayKey(py, pm, d)
    cells.push({
      key,
      date: d,
      inMonth: false,
      slots: slotMap.get(key) ?? [],
      isToday: key === todayK,
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(year, monthIndex, d)
    cells.push({
      key,
      date: d,
      inMonth: true,
      slots: slotMap.get(key) ?? [],
      isToday: key === todayK,
    })
  }

  const tail = new Date(year, monthIndex + 1, 1)
  while (cells.length % 7 !== 0) {
    const key = dayKey(tail.getFullYear(), tail.getMonth(), tail.getDate())
    cells.push({
      key,
      date: tail.getDate(),
      inMonth: false,
      slots: slotMap.get(key) ?? [],
      isToday: key === todayK,
    })
    tail.setDate(tail.getDate() + 1)
  }

  return cells
}

function monthRange(y: number, m0: number) {
  const m = m0 + 1
  const pad = (x: number) => String(x).padStart(2, '0')
  const from = `${y}-${pad(m)}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${pad(m)}-${pad(last)}`
  return { from, to }
}

function fmtHoldCountdown(sec: number) {
  const s = Math.max(0, sec)
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function normId(id: string | undefined | null): string {
  if (id == null || id === '') return ''
  return String(id).replace(/-/g, '').toLowerCase()
}

function normUuid(id: string | null | undefined): string {
  if (!id) return ''
  return String(id).replace(/-/g, '').toLowerCase()
}

type SlotUiState = 'open' | 'blocked' | 'pending' | 'booked' | 'orphan'

function classifyPublicSlot(
  slot: Slot,
  bookingBySlotId: Map<string, OwnerBookingItem>,
): { state: SlotUiState; title: string; meta: string } {
  const st = String(slot.status ?? '')
    .trim()
    .toUpperCase()
  if (st === 'OPEN') return { state: 'open', title: '비어 있음', meta: '예약 가능' }
  if (st === 'BLOCKED')
    return { state: 'blocked', title: '차단됨', meta: '예약 불가' }
  const b = bookingBySlotId.get(normId(slot.id))
  if (!b)
    return {
      state: 'orphan',
      title: '예약 연결 확인 필요',
      meta: 'BOOKED',
    }
  if (b.status === 'PENDING') {
    const name = b.booker_name?.trim() || '예약자'
    return { state: 'pending', title: `${name} · 승인 대기`, meta: '승인 대기' }
  }
  const name = b.booker_name?.trim() || '예약자'
  return { state: 'booked', title: `${name} · 예약 확정`, meta: '예약 확정' }
}

function scheduleDotClass(state: SlotUiState) {
  if (state === 'booked' || state === 'orphan') return 'bg-slate-900'
  if (state === 'pending') return 'bg-amber-400'
  if (state === 'blocked') return 'bg-slate-400'
  return 'binjari-ui-dot-open'
}

function slotRowSummary(c: ReturnType<typeof classifyPublicSlot>) {
  if (c.state === 'pending' || c.state === 'booked') return c.title
  return `${c.title} · ${c.meta}`
}

function formatSlotTime(iso: string, timeZone: string | undefined) {
  if (!timeZone?.trim()) return formatTimeShort(iso)
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date(iso))
      .replace(/\u202f/g, '')
      .trim()
  } catch {
    return formatTimeShort(iso)
  }
}

export function PublicBookPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { accessToken, isHost, userId } = useAuth()

  const now = new Date()
  const yRaw = Number(searchParams.get('y') ?? now.getFullYear())
  const mRaw = Number(searchParams.get('m') ?? now.getMonth())
  const y = Number.isFinite(yRaw) ? yRaw : now.getFullYear()
  const m0 =
    Number.isFinite(mRaw) && mRaw >= 0 && mRaw <= 11 ? mRaw : now.getMonth()

  const [page, setPage] = useState<HostSetting | null>(null)
  const [days, setDays] = useState<DayGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [modalSlot, setModalSlot] = useState<Slot | null>(null)
  const [holdToken, setHoldToken] = useState<string | null>(null)
  const [holdRemainingSeconds, setHoldRemainingSeconds] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [shareHint, setShareHint] = useState(false)
  const [ownerBookings, setOwnerBookings] = useState<OwnerBookingItem[]>([])

  const isOwnerHost = useMemo(() => {
    if (!accessToken || !isHost || !page?.host_id || !userId) return false
    return normUuid(userId) === normUuid(String(page.host_id))
  }, [accessToken, isHost, page?.host_id, userId])

  /** 로그인했으나 이 페이지 소유 호스트가 아닌 경우(멤버 예약자): 과거일 예약 제한 */
  const isLoggedInMemberRestricted = Boolean(accessToken && !isOwnerHost)

  const minBookableDateKey = useMemo(
    () => calendarDateKeyInTimeZone(new Date(), page?.host_timezone),
    [page?.host_timezone],
  )

  const bookingBySlotId = useMemo(() => {
    const m = new Map<string, OwnerBookingItem>()
    for (const b of ownerBookings) {
      if (b.status !== 'PENDING' && b.status !== 'CONFIRMED') continue
      const k = normId(b.slot_id)
      if (k) m.set(k, b)
    }
    return m
  }, [ownerBookings])

  const calendarCells = useMemo(
    () => buildMonthCells(y, m0, days, todayKeyNow()),
    [y, m0, days]
  )

  const setMonth = useCallback(
    (ny: number, nm: number) => {
      const p = new URLSearchParams(searchParams)
      p.set('y', String(ny))
      p.set('m', String(nm))
      setSearchParams(p, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      try {
        const [pr, { from, to }] = await Promise.all([
          apiGetJson<PageRes>(`/api/v1/public/booking-pages/${slug}`, {
            auth: false,
          }),
          Promise.resolve(monthRange(y, m0)),
        ])
        const sr = await apiGetJson<SlotsRes>(
          `/api/v1/public/booking-pages/${slug}/slots${buildQuery({ from, to })}`,
          { auth: false }
        )
        if (!cancelled) {
          setPage(pr.data)
          setDays(sr.data.days)
          setError(null)
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
  }, [slug, y, m0])

  useEffect(() => {
    if (!isOwnerHost || !page?.id) {
      setOwnerBookings([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<OwnerBookingsRes>(
          `/api/v1/host/bookings${buildQuery({ hostSettingId: page.id })}`,
        )
        if (!cancelled) setOwnerBookings(res.data.items)
      } catch {
        if (!cancelled) setOwnerBookings([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOwnerHost, page?.id])

  useEffect(() => {
    const tk = todayKeyNow()
    const cells = buildMonthCells(y, m0, days, tk)
    const hasSelectable = (c: (typeof cells)[0]) => {
      if (isOwnerHost) return c.slots.length > 0
      const open = c.slots.some((s) => s.status === 'OPEN')
      if (!open) return false
      if (isLoggedInMemberRestricted && c.key < minBookableDateKey) return false
      return true
    }
    const todayKeyForDefault = isLoggedInMemberRestricted
      ? minBookableDateKey
      : tk
    const defaultKey =
      cells.find((c) => c.inMonth && c.key === todayKeyForDefault)?.key ??
      cells.find((c) => c.inMonth && hasSelectable(c))?.key ??
      cells.find((c) => c.inMonth)?.key ??
      null
    setSelectedDateKey((prev) => {
      if (
        prev &&
        cells.some((c) => c.key === prev && c.inMonth) &&
        (!isLoggedInMemberRestricted || prev >= minBookableDateKey)
      ) {
        return prev
      }
      return defaultKey
    })
  }, [y, m0, days, isOwnerHost, isLoggedInMemberRestricted, minBookableDateKey])

  useEffect(() => {
    if (!selectedDateKey || !selectedSlotId) return
    const cell = calendarCells.find((c) => c.key === selectedDateKey)
    const ok = cell?.slots.some((s) => s.id === selectedSlotId && s.status === 'OPEN')
    if (!ok) setSelectedSlotId(null)
  }, [selectedDateKey, calendarCells, selectedSlotId])

  useEffect(() => {
    if (isOwnerHost) setSelectedSlotId(null)
  }, [isOwnerHost])

  useEffect(() => {
    if (!modalSlot || !holdToken) return
    const id = window.setInterval(() => {
      setHoldRemainingSeconds((s) => (s == null ? null : Math.max(0, s - 1)))
    }, 1000)
    return () => clearInterval(id)
  }, [modalSlot?.id, holdToken])

  const selectedCell = useMemo(
    () => calendarCells.find((c) => c.key === selectedDateKey) ?? null,
    [calendarCells, selectedDateKey]
  )

  const visibleDaySlots = useMemo(() => {
    const slots = selectedCell?.slots ?? []
    const sorted = [...slots].sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )
    if (isOwnerHost) return sorted
    return sorted.filter((s) => s.status === 'OPEN')
  }, [selectedCell, isOwnerHost])

  const selectedSlot =
    !isOwnerHost && selectedSlotId
      ? (visibleDaySlots.find((s) => s.id === selectedSlotId) ?? null)
      : null

  const summary = useMemo(() => {
    let openDayCount = 0
    let nextAvailable = '예약 가능 시간 없음'
    for (const c of calendarCells) {
      if (!c.inMonth) continue
      if (isLoggedInMemberRestricted && c.key < minBookableDateKey) continue
      const open = c.slots.filter((s) => s.status === 'OPEN')
      if (open.length > 0) {
        openDayCount += 1
        if (nextAvailable === '예약 가능 시간 없음') {
          nextAvailable = `${c.date}일 · ${formatTimeShort(open[0]!.start_time)}`
        }
      }
    }
    return { openDayCount, nextAvailable }
  }, [calendarCells, isLoggedInMemberRestricted, minBookableDateKey])

  const slotDurationLabel = useMemo(() => {
    const openFirst = days
      .flatMap((d) => d.slots)
      .find((x) => x.status === 'OPEN')
    if (!openFirst) return '슬롯'
    return `슬롯 ${slotDurationMinutes(openFirst)}분`
  }, [days])

  const approvalShort =
    page?.approval_type === 'AUTO' ? '즉시 확정' : '호스트 승인 후 확정'

  function prevMonth() {
    const d = new Date(y, m0, 1)
    d.setMonth(d.getMonth() - 1)
    setDoneMsg(null)
    setMonth(d.getFullYear(), d.getMonth())
  }

  function nextMonth() {
    const d = new Date(y, m0, 1)
    d.setMonth(d.getMonth() + 1)
    setDoneMsg(null)
    setMonth(d.getFullYear(), d.getMonth())
  }

  function selectDay(day: CalendarCell) {
    if (!day.inMonth) return
    if (isLoggedInMemberRestricted && day.key < minBookableDateKey) return
    setSelectedDateKey(day.key)
    setSelectedSlotId(null)
    setDoneMsg(null)
  }

  function selectSlot(slotId: string) {
    if (isOwnerHost) return
    setSelectedSlotId(slotId)
    setDoneMsg(null)
  }

  async function goToConfirm() {
    if (isOwnerHost || !selectedSlot) return
    await openBook(selectedSlot)
  }

  async function openBook(slot: Slot) {
    setDoneMsg(null)
    if (isOwnerHost) return
    if (slot.status !== 'OPEN') return
    if (isLoggedInMemberRestricted) {
      const slotDayKey = calendarDateKeyInTimeZone(
        new Date(slot.start_time),
        page?.host_timezone,
      )
      if (slotDayKey < minBookableDateKey) return
    }
    if (!accessToken) {
      navigate('/auth/login', {
        replace: false,
        state: { from: { pathname: `/book/${slug}`, search: `?y=${y}&m=${m0}` } },
      })
      return
    }
    setModalSlot(slot)
    setHoldToken(null)
    setHoldRemainingSeconds(null)
    setMessage('')
    setBusy(true)
    setError(null)
    try {
      const res = await apiPostJson<HoldRes>(`/api/v1/slots/${slot.id}/hold`, {})
      if (res.data.held && res.data.hold_token) {
        setHoldToken(res.data.hold_token)
        setHoldRemainingSeconds(res.data.remaining_seconds ?? 300)
      } else {
        setError('이 슬롯은 잠시 다른 사용자가 선택 중입니다.')
        setModalSlot(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '선점 실패')
      setModalSlot(null)
    } finally {
      setBusy(false)
    }
  }

  async function confirmBooking() {
    if (!modalSlot || !holdToken) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiPostJson<BookingRes>(
        '/api/v1/bookings',
        {
          slot_id: modalSlot.id,
          hold_token: holdToken,
          request_message: message.trim() || null,
        },
        { idempotencyKey: crypto.randomUUID() }
      )
      const st = res.data.booking.status
      setDoneMsg(
        st === 'CONFIRMED'
          ? '예약이 확정되었습니다.'
          : st === 'PENDING'
            ? '예약 요청이 접수되었습니다. 호스트 승인을 기다려 주세요.'
            : '처리되었습니다.'
      )
      setModalSlot(null)
      setHoldToken(null)
      setHoldRemainingSeconds(null)
      setSelectedSlotId(null)
      const { from, to } = monthRange(y, m0)
      const sr = await apiGetJson<SlotsRes>(
        `/api/v1/public/booking-pages/${slug}/slots${buildQuery({ from, to })}`,
        { auth: false }
      )
      setDays(sr.data.days)
    } catch (e) {
      setError(e instanceof Error ? e.message : '예약 실패')
    } finally {
      setBusy(false)
    }
  }

  async function cancelModal() {
    if (!modalSlot || !holdToken) {
      setModalSlot(null)
      setHoldToken(null)
      setHoldRemainingSeconds(null)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiDelete(
        `/api/v1/slots/${modalSlot.id}/hold${buildQuery({ hold_token: holdToken })}`
      )
      setModalSlot(null)
      setHoldToken(null)
      setHoldRemainingSeconds(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '선점 해제 실패')
    } finally {
      setBusy(false)
    }
  }

  async function copyPublicLink() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setShareHint(true)
      window.setTimeout(() => setShareHint(false), 2000)
    } catch {
      setError('클립보드 복사에 실패했습니다.')
    }
  }

  const monthLabel = `${y}년 ${m0 + 1}월`

  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_55%,#ecfdf5_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="min-w-0 text-2xl font-semibold leading-snug tracking-tight text-slate-900 md:text-3xl">
                    {page?.title ?? '예약'}
                  </h1>
                  <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--binjari-primary-hover)] ring-1 ring-[color:var(--binjari-primary-border)] md:text-xs">
                    <Sparkles className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" />
                    캘린더 중심 예약
                  </div>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-snug text-slate-600">
                  월간 캘린더에서 예약 가능한 날짜를 먼저 확인하고, 선택한 날짜의 시간만 오른쪽에서 빠르게 비교할 수 있습니다.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                <div className="text-xs font-medium text-slate-500">가장 빠른 예약</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {m0 + 1}월 {summary.nextAvailable}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <InfoPill icon={CheckCircle2} text={approvalShort} />
              {page ? (
                <InfoPill icon={Globe2} text={`${page.host_timezone} 기준`} />
              ) : (
                <InfoPill icon={Globe2} text="타임존" />
              )}
              <InfoPill icon={Clock3} text={slotDurationLabel} />
              <InfoPill
                icon={CalendarDays}
                text={`이번 달 예약 가능일 ${summary.openDayCount}일`}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {accessToken && isHost ? null : (
                <>
                  {accessToken ? (
                    <Link
                      to="/me/bookings"
                      className="binjari-btn-solid inline-flex rounded-2xl px-5 py-3 text-sm font-semibold text-white"
                    >
                      내 예약 보기
                    </Link>
                  ) : (
                    <Link
                      to="/auth/login"
                      state={{
                        from: {
                          pathname: `/book/${slug}`,
                          search: `?y=${y}&m=${m0}`,
                        },
                      }}
                      className="binjari-btn-solid inline-flex rounded-2xl px-5 py-3 text-sm font-semibold text-white"
                    >
                      로그인 후 예약
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyPublicLink()}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm"
                  >
                    {shareHint ? '링크 복사됨' : '공개 페이지 공유'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border-b border-slate-100 xl:border-b-0 xl:border-r xl:border-slate-100">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 md:px-8">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전 달
                </button>
                <div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
                  <CalendarDays className="h-4 w-4" />
                  {monthLabel}
                </div>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
                >
                  다음 달
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="px-4 pb-4 pt-3 md:px-6 md:pb-6">
                <div className="grid grid-cols-7 gap-1 px-1 pb-1.5 text-center text-[10px] font-medium leading-tight text-slate-500">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                    <div key={day} className="py-1">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((day) => (
                    <CalendarCellView
                      key={day.key}
                      day={day}
                      active={selectedDateKey === day.key}
                      onClick={() => selectDay(day)}
                      isOwnerHost={isOwnerHost}
                      bookingBySlotId={bookingBySlotId}
                      minBookableDateKey={
                        isLoggedInMemberRestricted ? minBookableDateKey : undefined
                      }
                    />
                  ))}
                </div>

                {isOwnerHost ? (
                  <div className="mt-3 border-t border-slate-100 px-1 pt-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-800" />
                        예약 확정
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="binjari-ui-dot-open h-2.5 w-2.5 shrink-0 rounded-full" />
                        예약 가능
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
                        승인 대기
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
                        차단
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] leading-snug text-slate-500">
                      캘린더 칸의 색점 옆 숫자는, 그 날짜에 해당 상태인 슬롯이 각각
                      몇 개인지 뜻합니다.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-slate-100 px-1 pt-3">
                    <div className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
                      <span className="binjari-ui-dot-open h-2.5 w-2.5 shrink-0 rounded-full" />
                      숫자 · 예약 가능한 슬롯 개수
                    </div>
                    <p className="mt-2 text-[10px] leading-snug text-slate-500">
                      열려 있는 슬롯만 세며, 이미 찬 시간은 포함하지 않습니다.
                      {isLoggedInMemberRestricted
                        ? ' 로그인 상태에서는 오늘 이후 날짜만 예약할 수 있습니다.'
                        : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <aside className="bg-slate-50/50 p-5 md:p-6">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">선택한 날짜</div>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      {selectedDateKey ? formatDayTitle(selectedDateKey) : '—'}
                    </h2>
                  </div>
                  {selectedCell?.isToday ? (
                    <span className="rounded-full bg-[var(--binjari-primary-subtle)] px-3 py-1 text-xs font-semibold text-[color:var(--binjari-primary-hover)]">
                      오늘
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <p>
                      {isOwnerHost
                        ? '내 예약 페이지 미리보기입니다. 아래에는 해당 날짜의 모든 슬롯이 표시되며, 호스트 본인은 이 화면에서 직접 예약할 수 없습니다.'
                        : isLoggedInMemberRestricted
                          ? '캘린더에서 날짜를 선택하면 예약 가능한 시간만 아래에 정리됩니다. 오늘 이전 날짜는 예약할 수 없습니다.'
                          : '캘린더에서 날짜를 선택하면 예약 가능한 시간만 아래에 정리됩니다. 예약 가능한 시간이 없는 날은 안내됩니다.'}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <strong className="text-sm text-slate-900">
                      {isOwnerHost ? '이 날짜 슬롯' : '예약 가능한 시간'}
                    </strong>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        isOwnerHost
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-[var(--binjari-primary-subtle)] text-[color:var(--binjari-primary-hover)]'
                      }`}
                    >
                      {isOwnerHost
                        ? `${visibleDaySlots.length}칸`
                        : `${visibleDaySlots.length}개 가능`}
                    </span>
                  </div>

                  {visibleDaySlots.length > 0 ? (
                    <div className="space-y-1.5">
                      {visibleDaySlots.map((slot) => {
                        const c = classifyPublicSlot(slot, bookingBySlotId)
                        const selectable =
                          slot.status === 'OPEN' && !isOwnerHost
                        const selected = selectable && selectedSlotId === slot.id
                        const rowClass =
                          'flex w-full min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ' +
                          (selectable
                            ? selected
                              ? 'cursor-pointer border-slate-900 ring-1 ring-slate-900 bg-slate-50 text-slate-900'
                              : 'cursor-pointer border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                            : 'border-slate-200 bg-white text-slate-900')
                        const inner = (
                          <>
                            <div className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-700">
                              {formatSlotTime(
                                slot.start_time,
                                page?.host_timezone,
                              )}
                            </div>
                            <div
                              className={`h-2 w-2 shrink-0 rounded-full ${scheduleDotClass(c.state)}`}
                              aria-hidden
                            />
                            <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900">
                              {slotRowSummary(c)}
                            </p>
                            {selectable ? (
                              <ChevronRight
                                className="h-3 w-3 shrink-0 text-slate-400"
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
                        return selectable ? (
                          <button
                            key={slot.id}
                            type="button"
                            className={rowClass}
                            onClick={() => selectSlot(slot.id)}
                          >
                            {inner}
                          </button>
                        ) : (
                          <div key={slot.id} className={rowClass}>
                            {inner}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      {isOwnerHost
                        ? '이 날짜에 생성된 슬롯이 없습니다.'
                        : '이 날짜에는 예약 가능한 시간이 없습니다.'}
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-medium text-slate-500">현재 선택</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {isOwnerHost
                      ? '내 페이지에서는 예약할 수 없습니다'
                      : selectedSlot && selectedDateKey
                        ? `${formatDayTitle(selectedDateKey)} · ${formatSlotTime(selectedSlot.start_time, page?.host_timezone)} - ${formatSlotTime(selectedSlot.end_time, page?.host_timezone)}`
                        : '시간을 선택해 주세요'}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {isOwnerHost
                      ? '게스트에게 공개되는 예약 흐름은 로그아웃 후 같은 링크로 확인할 수 있습니다.'
                      : '선택 후 예약 확인에서 메시지를 남기고 바로 완료할 수 있습니다.'}
                  </div>
                  <button
                    type="button"
                    onClick={() => void goToConfirm()}
                    disabled={isOwnerHost || !selectedSlot || busy}
                    className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      !isOwnerHost && selectedSlot && !busy
                        ? 'binjari-btn-solid text-white'
                        : 'cursor-not-allowed bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isOwnerHost
                      ? '예약 불가'
                      : '예약 확인으로 이동'}
                  </button>
                </div>
              </div>

              {doneMsg ? (
                <div className="mt-4 rounded-[24px] border border-[color:var(--binjari-primary-border)] bg-[var(--binjari-primary-subtle)] p-5 text-sm text-[color:var(--binjari-text-heading)] shadow-sm">
                  <div className="font-semibold">예약이 접수되었습니다.</div>
                  <div className="mt-1 text-[color:var(--binjari-text-muted)]">{doneMsg}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to="/me/bookings"
                      className="binjari-btn-solid rounded-xl px-3 py-2 text-xs font-semibold text-white"
                    >
                      내 예약 보기
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDoneMsg(null)}
                      className="rounded-xl border border-[color:var(--binjari-primary-border)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--binjari-text-heading)]"
                    >
                      다른 날짜 보기
                    </button>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {days.length === 0 && !error && page ? (
          <p className="text-center text-sm text-slate-500">이 달에 열린 슬롯이 없습니다.</p>
        ) : null}
      </div>

      {modalSlot && holdToken ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-4 md:items-center">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--binjari-primary-subtle)] px-3 py-1 text-xs font-medium text-[color:var(--binjari-primary-hover)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              임시 확보됨
              {holdRemainingSeconds != null
                ? ` · ${fmtHoldCountdown(holdRemainingSeconds)} 남음`
                : ''}
            </div>
            <h3 className="text-xl font-semibold text-slate-900">예약 최종 확인</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              캘린더에서 선택한 날짜와 시간을 확인하고 예약을 완료하세요.
            </p>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-medium text-slate-500">선택한 예약</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formatDayTitle(dayKeyFromSlot(modalSlot))} · {formatTimeShort(modalSlot.start_time)} -{' '}
                {formatTimeShort(modalSlot.end_time)}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {approvalShort}
                {page ? ` · ${page.host_timezone} 기준` : ''}
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="bk-msg" className="mb-2 block text-sm font-medium text-slate-800">
                요청 메시지 (선택)
              </label>
              <textarea
                id="bk-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="미리 전달하고 싶은 내용을 적어 주세요."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void cancelModal()}
                disabled={busy}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void confirmBooking()}
                disabled={busy}
                className="binjari-btn-solid flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
              >
                {busy ? '처리 중…' : '예약 완료하기'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function dayKeyFromSlot(slot: Slot) {
  const d = new Date(slot.start_time)
  return dayKey(d.getFullYear(), d.getMonth(), d.getDate())
}

function InfoPill({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ className?: string }>
  text: string
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
      <Icon className="h-3.5 w-3.5" />
      {text}
    </div>
  )
}

function CalendarCellView({
  day,
  active,
  onClick,
  isOwnerHost,
  bookingBySlotId,
  minBookableDateKey,
}: {
  day: CalendarCell
  active: boolean
  onClick: () => void
  isOwnerHost: boolean
  bookingBySlotId: Map<string, OwnerBookingItem>
  /** 로그인 멤버만: 이 날짜 이전 칸은 선택·예약 불가(호스트 타임존 기준 ‘오늘’). */
  minBookableDateKey?: string
}) {
  const isMemberPastBlocked =
    minBookableDateKey != null &&
    day.inMonth &&
    day.key < minBookableDateKey

  const openCount = day.slots.filter((slot) => slot.status === 'OPEN').length

  let nConfirmed = 0
  let nPending = 0
  let nOpen = 0
  let nBlocked = 0
  if (isOwnerHost) {
    for (const s of day.slots) {
      const cl = classifyPublicSlot(s, bookingBySlotId)
      if (cl.state === 'open') nOpen += 1
      else if (cl.state === 'blocked') nBlocked += 1
      else if (cl.state === 'pending') nPending += 1
      else nConfirmed += 1
    }
  }

  const ariaDayLabel = day.inMonth ? `${day.date}일` : '다른 달'

  /** 이번 달(inMonth)만 워터마크·대비를 ~20% 진하게, 전·다음 달은 유지 */
  const watermarkClass = !day.inMonth
    ? 'text-slate-300/35'
    : isMemberPastBlocked
      ? 'text-slate-300/25'
      : active
        ? 'text-white/[0.34]'
        : day.isToday
          ? 'text-blue-600/30'
          : 'text-slate-600/[0.38]'

  const hasOwnerCounts =
    isOwnerHost &&
    (nConfirmed > 0 || nOpen > 0 || nPending > 0 || nBlocked > 0)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!day.inMonth || isMemberPastBlocked}
      aria-label={day.inMonth ? ariaDayLabel : undefined}
      title={isMemberPastBlocked ? '이 날짜는 예약할 수 없습니다' : undefined}
      className={`relative min-h-[68px] overflow-hidden rounded-xl border p-1.5 text-left align-top transition ${
        !day.inMonth
          ? 'cursor-default border-slate-100 bg-slate-50 text-slate-300'
          : isMemberPastBlocked
            ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
            : active
              ? 'border-[var(--binjari-primary)] bg-[var(--binjari-primary)] text-white shadow-[var(--binjari-shadow-primary-soft)]'
              : 'border-slate-300/90 bg-white text-slate-950 hover:border-[color:var(--binjari-accent)] hover:bg-slate-50'
      }`}
    >
      <span
        className={`pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 select-none text-[1.85rem] font-semibold tabular-nums leading-none ${watermarkClass}`}
        aria-hidden
      >
        {day.date}
      </span>

      <div className="relative z-[1] flex min-h-[58px] flex-col justify-between">
        <div className="flex justify-end">
          {day.isToday && !isMemberPastBlocked ? (
            <span
              className={`rounded-full px-1 py-px text-[8px] font-medium leading-none ${
                active ? 'bg-white/15 text-white' : 'bg-[var(--binjari-primary-subtle)] text-[color:var(--binjari-primary-hover)]'
              }`}
            >
              오늘
            </span>
          ) : null}
        </div>

        <div className="flex min-h-[18px] flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {isMemberPastBlocked ? (
            <span className="text-[9px] font-medium text-slate-400">—</span>
          ) : isOwnerHost ? (
            hasOwnerCounts ? (
              <>
                {nConfirmed > 0 ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${active ? 'text-white' : 'text-zinc-800'}`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-white' : 'bg-zinc-800'}`}
                      aria-hidden
                    />
                    {nConfirmed}
                  </span>
                ) : null}
                {nOpen > 0 ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${active ? 'text-white' : 'text-[color:var(--binjari-primary)]'}`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-white/80' : 'binjari-ui-dot-open'}`}
                      aria-hidden
                    />
                    {nOpen}
                  </span>
                ) : null}
                {nPending > 0 ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${active ? 'text-white' : 'text-amber-600'}`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-amber-200' : 'bg-amber-400'}`}
                      aria-hidden
                    />
                    {nPending}
                  </span>
                ) : null}
                {nBlocked > 0 ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${active ? 'text-white' : 'text-slate-600'}`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-slate-200' : 'bg-slate-400'}`}
                      aria-hidden
                    />
                    {nBlocked}
                  </span>
                ) : null}
              </>
            ) : (
              <span
                className={`text-[9px] font-medium ${active ? 'text-white/70' : 'text-slate-400'}`}
              >
                —
              </span>
            )
          ) : openCount > 0 ? (
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${active ? 'text-white' : 'text-[color:var(--binjari-primary)]'}`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-white/80' : 'binjari-ui-dot-open'}`}
                aria-hidden
              />
              {openCount}
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-white/40' : 'bg-slate-300'}`}
                aria-hidden
              />
              0
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
