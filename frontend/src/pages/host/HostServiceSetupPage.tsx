import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  apiDelete,
  apiGetJson,
  apiPostJson,
  buildQuery,
} from '../../lib/api'
import { coverGradient } from './BookingPageCoverHero'
import '../page-shell.css'
import './host-services.css'
import './host-edit-layout.css'
import './host-service-setup.css'
import {
  OPERATING_RULE_DAYS as DAYS,
  buildDayMap,
  normalizeTime,
  ruleKindLabel,
  toHHMM,
  toSec,
  validateWizardDraft,
} from './hostOperatingRules'
import type { HostOperatingRule } from './hostOperatingRules'
import { defaultSlotRange, slotStatusLabel } from './hostSlotsShared'

type HostPage = {
  id: string
  slug: string
  title: string
  description: string | null
  host_timezone: string
  slot_duration_mins: number
  buffer_duration_mins: number
  approval_type: string
  is_active: boolean
  is_listed: boolean
  listing_category: string | null
  setup_completed: boolean
}

type OneRes = { success: true; data: HostPage }

type Rule = HostOperatingRule

type RulesRes = { success: true; data: { items: Rule[] } }

type PageOverride = {
  id: string
  override_date: string
  override_type: 'DAY_OFF' | 'OPEN' | 'BLOCK'
  start_time: string | null
  end_time: string | null
  reason: string | null
}

type OverridesListRes = { success: true; data: { items: PageOverride[] } }

type HostSlotRow = {
  id: string
  start_time: string
  end_time: string
  status: string
}

type HostSlotsListRes = { success: true; data: { items: HostSlotRow[] } }

function overridesMonthBounds() {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth() + 1
  const pad = (x: number) => String(x).padStart(2, '0')
  const from = `${y}-${pad(m)}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${pad(m)}-${pad(last)}`
  return { from, to }
}

function overrideTypeLabel(t: PageOverride['override_type']) {
  switch (t) {
    case 'DAY_OFF':
      return '전일 휴무'
    case 'OPEN':
      return '추가 오픈'
    case 'BLOCK':
      return '시간대 차단'
    default:
      return t
  }
}

function formatLocalSlotRange(isoStart: string, isoEnd: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
  const s = new Date(isoStart).toLocaleTimeString('ko-KR', opts)
  const e = new Date(isoEnd).toLocaleTimeString('ko-KR', opts)
  return `${s}–${e}`
}

function secondsSinceMidnightFromDate(d: Date) {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

/** 사용자가 입력한 HH:MM 구간이 슬롯(로컬 시각 기준)과 겹치는지 */
function overlapsUserRangeWithSlot(
  startHHMM: string,
  endHHMM: string,
  slotStartIso: string,
  slotEndIso: string,
) {
  const a0 = toSec(startHHMM)
  const a1 = toSec(endHHMM)
  const b0 = secondsSinceMidnightFromDate(new Date(slotStartIso))
  const b1 = secondsSinceMidnightFromDate(new Date(slotEndIso))
  return a0 < b1 && b0 < a1
}

type GenRes = {
  success: true
  data: { generated_count: number; skipped_count: number }
}

type ClearRes = {
  success: true
  data: {
    deleted_count: number
    booked_kept_count: number
    from_date: string
    to_date: string
  }
}

const MONTH_LABELS = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
] as const

/** 완료 단계 미리보기 달력 헤더만 — 일~토 (규칙 day_of_week 인덱스와 무관) */
const COMPLETE_CAL_WEEKDAY_LABELS = [
  '일',
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
] as const

type SimulatedSlot = { start: string; end: string }

type DaySummaryCell = {
  date: string
  isToday: boolean
  isCurrentMonth: boolean
  slotCount: number
  slots: SimulatedSlot[]
  openRules: Rule[]
  breakRules: Rule[]
  overrides: PageOverride[]
  hasDayOff: boolean
  hasExtraOpen: boolean
  hasBlock: boolean
}

function minutesFromTime(value: string) {
  return Math.floor(toSec(value.length === 5 ? `${value}:00` : value) / 60)
}

function formatMinutesAsHHMM(minutes: number) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function ymd(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYmd(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function sameDate(a: Date, b: Date) {
  return ymd(a) === ymd(b)
}

function getMondayBasedDayIndex(date: Date) {
  return (date.getDay() + 6) % 7
}

function buildBaseSegments(openRules: Rule[], breakRules: Rule[]) {
  const segments: Array<{ start: number; end: number }> = []

  for (const openRule of openRules) {
    let chunks = [
      {
        start: minutesFromTime(openRule.start_time),
        end: minutesFromTime(openRule.end_time),
      },
    ]

    for (const breakRule of breakRules) {
      const breakStart = minutesFromTime(breakRule.start_time)
      const breakEnd = minutesFromTime(breakRule.end_time)
      const nextChunks: Array<{ start: number; end: number }> = []

      for (const chunk of chunks) {
        if (breakEnd <= chunk.start || breakStart >= chunk.end) {
          nextChunks.push(chunk)
          continue
        }
        if (breakStart > chunk.start) {
          nextChunks.push({ start: chunk.start, end: breakStart })
        }
        if (breakEnd < chunk.end) {
          nextChunks.push({ start: breakEnd, end: chunk.end })
        }
      }

      chunks = nextChunks
    }

    segments.push(...chunks)
  }

  return segments.filter((segment) => segment.end > segment.start)
}

function addOpenOverrideSegments(
  segments: Array<{ start: number; end: number }>,
  dayOverrides: PageOverride[],
) {
  const next = [...segments]
  for (const override of dayOverrides) {
    if (
      override.override_type === 'OPEN' &&
      override.start_time &&
      override.end_time
    ) {
      next.push({
        start: minutesFromTime(override.start_time),
        end: minutesFromTime(override.end_time),
      })
    }
  }
  return next
}

function generateSlotsFromSegments(
  segments: Array<{ start: number; end: number }>,
  slotDurationMins: number,
) {
  const slots: SimulatedSlot[] = []
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start)

  for (const segment of sortedSegments) {
    for (
      let cursor = segment.start;
      cursor + slotDurationMins <= segment.end;
      cursor += slotDurationMins
    ) {
      slots.push({
        start: formatMinutesAsHHMM(cursor),
        end: formatMinutesAsHHMM(cursor + slotDurationMins),
      })
    }
  }

  return slots
}

function removeBlockedSlots(
  slots: SimulatedSlot[],
  dayOverrides: PageOverride[],
) {
  return slots.filter((slot) => {
    const slotStart = minutesFromTime(slot.start)
    const slotEnd = minutesFromTime(slot.end)

    return !dayOverrides.some((override) => {
      if (
        override.override_type !== 'BLOCK' ||
        !override.start_time ||
        !override.end_time
      ) {
        return false
      }
      const blockStart = minutesFromTime(override.start_time)
      const blockEnd = minutesFromTime(override.end_time)
      return slotStart < blockEnd && blockStart < slotEnd
    })
  })
}

function buildCompletePreviewDaySummary(
  date: Date,
  viewMonth: Date,
  pageOverrides: PageOverride[],
  ruleItems: Rule[],
  slotDurationMins: number,
): DaySummaryCell {
  const key = ymd(date)
  const dow = getMondayBasedDayIndex(date)
  const openRules = ruleItems.filter(
    (rule) => rule.day_of_week === dow && rule.rule_type === 'OPEN',
  )
  const breakRules = ruleItems.filter(
    (rule) => rule.day_of_week === dow && rule.rule_type === 'BREAK',
  )
  const targetOverrides = pageOverrides.filter((item) => item.override_date === key)
  const hasDayOff = targetOverrides.some((item) => item.override_type === 'DAY_OFF')
  const hasExtraOpen = targetOverrides.some((item) => item.override_type === 'OPEN')
  const hasBlock = targetOverrides.some((item) => item.override_type === 'BLOCK')

  let slots: SimulatedSlot[] = []
  if (!hasDayOff) {
    const baseSegments = buildBaseSegments(openRules, breakRules)
    const mergedSegments = addOpenOverrideSegments(baseSegments, targetOverrides)
    const baseSlots = generateSlotsFromSegments(mergedSegments, slotDurationMins)
    slots = removeBlockedSlots(baseSlots, targetOverrides)
  }

  const today = new Date()

  return {
    date: key,
    isToday: sameDate(date, today),
    isCurrentMonth:
      date.getMonth() === viewMonth.getMonth() &&
      date.getFullYear() === viewMonth.getFullYear(),
    slotCount: slots.length,
    slots,
    openRules,
    breakRules,
    overrides: targetOverrides,
    hasDayOff,
    hasExtraOpen,
    hasBlock,
  }
}

/** 해당 월이 들어가는 주 단위만큼만(4~6주) — 맨 윗줄 일요일 ~ 맨 아랫줄 토요일 */
function completePreviewMonthGrid(viewMonth: Date) {
  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  const start = addDays(first, -first.getDay())
  const endSaturday = addDays(last, 6 - last.getDay())
  const n =
    Math.round((endSaturday.getTime() - start.getTime()) / 86400000) + 1
  return Array.from({ length: n }, (_, i) => addDays(start, i))
}

/** 달력에 그려지는 첫날·마지막날 — 슬롯·예외 API 조회 범위 */
function completeCalendarGridDateRange(viewMonth: Date): { from: string; to: string } {
  const cells = completePreviewMonthGrid(viewMonth)
  if (!cells.length) {
    const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const key = ymd(d)
    return { from: key, to: key }
  }
  return { from: ymd(cells[0]!), to: ymd(cells[cells.length - 1]!) }
}

function overrideBadgeLabel(value: PageOverride['override_type']) {
  if (value === 'DAY_OFF') return '휴무'
  if (value === 'OPEN') return '추가 오픈'
  return '차단'
}

function localHHMM(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 호스트 슬롯 API 응답을 로컬 달력 날짜(YYYY-MM-DD)별로 묶고, 시간순 정렬 */
function groupHostSlotsByLocalYmd(
  items: HostSlotRow[],
): Map<string, SimulatedSlot[]> {
  const m = new Map<string, SimulatedSlot[]>()
  for (const row of items) {
    const start = new Date(row.start_time)
    const key = ymd(start)
    const sim: SimulatedSlot = {
      start: localHHMM(start),
      end: localHHMM(new Date(row.end_time)),
    }
    const list = m.get(key) ?? []
    list.push(sim)
    m.set(key, list)
  }
  for (const [, list] of m) {
    list.sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start))
  }
  return m
}

export function HostServiceSetupPage() {
  const { hostSettingId } = useParams<{ hostSettingId: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState<2 | 3 | 4>(2)
  const [page, setPage] = useState<HostPage | null>(null)
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [fromDate, setFromDate] = useState(defaultSlotRange().from)
  const [toDate, setToDate] = useState(defaultSlotRange().to)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [wizardStep3SlotCount, setWizardStep3SlotCount] = useState<
    number | null
  >(null)
  const [overrides, setOverrides] = useState<PageOverride[] | null>(null)
  const [overrideDate, setOverrideDate] = useState('')
  const [overrideType, setOverrideType] = useState<
    'DAY_OFF' | 'OPEN' | 'BLOCK'
  >('DAY_OFF')
  const [overridesMsg, setOverridesMsg] = useState<string | null>(null)
  const [overrideStartTime, setOverrideStartTime] = useState('')
  const [overrideEndTime, setOverrideEndTime] = useState('')
  const [exceptionDaySlots, setExceptionDaySlots] = useState<
    HostSlotRow[] | null
  >(null)
  const [exceptionDaySlotsLoading, setExceptionDaySlotsLoading] =
    useState(false)
  const [exceptionSlotsError, setExceptionSlotsError] = useState<string | null>(
    null,
  )
  const [completeViewMonth, setCompleteViewMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [completeSelectedDateKey, setCompleteSelectedDateKey] = useState(() =>
    ymd(new Date()),
  )
  const [completeMonthOverrides, setCompleteMonthOverrides] = useState<
    PageOverride[]
  >([])
  const [completeOverridesLoading, setCompleteOverridesLoading] =
    useState(false)
  const [completeMonthDbSlots, setCompleteMonthDbSlots] = useState<
    HostSlotRow[]
  >([])
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [ruleType, setRuleType] = useState<'OPEN' | 'BREAK'>('OPEN')
  const [rulesWizardSuccess, setRulesWizardSuccess] = useState<string | null>(
    null,
  )

  function wizardStorageKey() {
    return hostSettingId ? `hostWizardStep:${hostSettingId}` : ''
  }

  function persistStep(s: 2 | 3 | 4) {
    const k = wizardStorageKey()
    if (k) sessionStorage.setItem(k, String(s))
  }

  useEffect(() => {
    if (!hostSettingId) return
    let c = false
    ;(async () => {
      try {
        const [one, rlist] = await Promise.all([
          apiGetJson<OneRes>(`/api/v1/host/booking-pages/${hostSettingId}`),
          apiGetJson<RulesRes>(
            `/api/v1/host/booking-pages/${hostSettingId}/rules`,
          ),
        ])
        if (c) return
        setPage(one.data)
        setRules(rlist.data.items)
        if (one.data.setup_completed) {
          navigate(`/host/services/${one.data.slug}/dashboard`, {
            replace: true,
          })
          return
        }
        const saved = sessionStorage.getItem(wizardStorageKey())
        if (saved === '2' || saved === '3' || saved === '4') {
          setStep(Number(saved) as 2 | 3 | 4)
          return
        }
        if (saved === '5') {
          setStep(4)
          return
        }
        setStep(rlist.data.items.length === 0 ? 2 : 3)
      } catch (e) {
        if (!c) {
          setError(e instanceof Error ? e.message : '불러오기 실패')
        }
      }
    })()
    return () => {
      c = true
    }
  }, [hostSettingId, navigate])

  useEffect(() => {
    if (step !== 2) setRulesWizardSuccess(null)
  }, [step])

  useEffect(() => {
    if (step !== 4) setOverridesMsg(null)
  }, [step])

  useEffect(() => {
    if (!hostSettingId || step !== 4) return
    let cancelled = false
    ;(async () => {
      try {
        const { from, to } = overridesMonthBounds()
        const res = await apiGetJson<OverridesListRes>(
          `/api/v1/host/booking-pages/${hostSettingId}/overrides${buildQuery({ from, to })}`,
        )
        if (!cancelled) setOverrides(res.data.items)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '예외 일정 불러오기 실패')
          setOverrides([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostSettingId, step])

  useEffect(() => {
    if (!hostSettingId || step !== 4 || !overrideDate) {
      setExceptionDaySlots(null)
      setExceptionDaySlotsLoading(false)
      setExceptionSlotsError(null)
      return
    }
    if (overrideType !== 'OPEN' && overrideType !== 'BLOCK') {
      setExceptionDaySlots(null)
      setExceptionDaySlotsLoading(false)
      setExceptionSlotsError(null)
      return
    }
    let cancelled = false
    setExceptionDaySlotsLoading(true)
    setExceptionSlotsError(null)
    ;(async () => {
      try {
        const res = await apiGetJson<HostSlotsListRes>(
          `/api/v1/host/booking-pages/${hostSettingId}/slots${buildQuery({ from: overrideDate, to: overrideDate })}`,
        )
        if (!cancelled) {
          const items = [...res.data.items].sort(
            (a, b) =>
              new Date(a.start_time).getTime() -
              new Date(b.start_time).getTime(),
          )
          setExceptionDaySlots(items)
        }
      } catch (e) {
        if (!cancelled) {
          setExceptionDaySlots([])
          setExceptionSlotsError(
            e instanceof Error ? e.message : '슬롯 목록을 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!cancelled) setExceptionDaySlotsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostSettingId, step, overrideDate, overrideType])

  useEffect(() => {
    if (!activated) return
    const n = new Date()
    setCompleteViewMonth(new Date(n.getFullYear(), n.getMonth(), 1))
    setCompleteSelectedDateKey(ymd(n))
  }, [activated])

  useEffect(() => {
    if (!hostSettingId || !activated) return
    let cancelled = false
    const { from, to } = completeCalendarGridDateRange(completeViewMonth)
    setCompleteOverridesLoading(true)
    setCompleteMonthDbSlots([])
    const q = buildQuery({ from, to })
    ;(async () => {
      try {
        const [ovRes, slRes] = await Promise.all([
          apiGetJson<OverridesListRes>(
            `/api/v1/host/booking-pages/${hostSettingId}/overrides${q}`,
          ),
          apiGetJson<HostSlotsListRes>(
            `/api/v1/host/booking-pages/${hostSettingId}/slots${q}`,
          ),
        ])
        if (!cancelled) {
          setCompleteMonthOverrides(ovRes.data.items)
          setCompleteMonthDbSlots(slRes.data.items)
        }
      } catch {
        if (!cancelled) {
          setCompleteMonthOverrides([])
          setCompleteMonthDbSlots([])
        }
      } finally {
        if (!cancelled) setCompleteOverridesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostSettingId, activated, completeViewMonth])

  useEffect(() => {
    if (!activated) return
    setCompleteSelectedDateKey((prev) => {
      const y = completeViewMonth.getFullYear()
      const m = completeViewMonth.getMonth()
      const pd = parseYmd(prev)
      if (pd.getFullYear() === y && pd.getMonth() === m) return prev
      const today = new Date()
      if (today.getFullYear() === y && today.getMonth() === m) return ymd(today)
      return `${y}-${String(m + 1).padStart(2, '0')}-01`
    })
  }, [activated, completeViewMonth])

  const publicUrl = useMemo(() => {
    const s = page?.slug?.trim().toLowerCase()
    return `/book/${s || 'my-studio'}`
  }, [page?.slug])

  const heroGradient = useMemo(
    () =>
      coverGradient(
        (page?.slug?.trim().toLowerCase() || 'setup') + '-preview',
      ),
    [page?.slug],
  )

  const grouped = useMemo(() => buildDayMap(rules ?? []), [rules])

  const summaryText = useMemo(() => {
    if (!selectedDays.length) return '요일을 하나 이상 선택해 주세요.'
    const dayText = selectedDays.map((d) => DAYS[d]).join(', ')
    return `${dayText}에 ${ruleKindLabel(ruleType)} ${startTime}–${endTime}를 적용합니다.`
  }, [selectedDays, ruleType, startTime, endTime])

  async function refetchRulesList() {
    if (!hostSettingId) return
    const rlist = await apiGetJson<RulesRes>(
      `/api/v1/host/booking-pages/${hostSettingId}/rules`,
    )
    setRules(rlist.data.items)
  }

  function toggleWizardDay(day: number) {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    )
  }

  function applyWizardDays(days: number[]) {
    setSelectedDays(days)
  }

  async function addRulesWizard(e: FormEvent) {
    e.preventDefault()
    if (!hostSettingId) return
    setError(null)
    setRulesWizardSuccess(null)
    const invalid = validateWizardDraft(
      rules ?? [],
      selectedDays,
      ruleType,
      startTime,
      endTime,
    )
    if (invalid) {
      setError(invalid)
      return
    }
    setLoading(true)
    try {
      const st = normalizeTime(startTime)
      const et = normalizeTime(endTime)
      for (const day of selectedDays) {
        await apiPostJson(`/api/v1/host/booking-pages/${hostSettingId}/rules`, {
          day_of_week: day,
          start_time: st,
          end_time: et,
          rule_type: ruleType,
        })
      }
      await refetchRulesList()
      setRulesWizardSuccess(`${selectedDays.length}개 요일에 규칙을 적용했습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '규칙 추가 실패')
    } finally {
      setLoading(false)
    }
  }

  async function removeWizardRule(id: string) {
    if (!hostSettingId) return
    setError(null)
    setRulesWizardSuccess(null)
    setLoading(true)
    try {
      await apiDelete(`/api/v1/host/rules/${id}`)
      await refetchRulesList()
      setRulesWizardSuccess('규칙을 삭제했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setLoading(false)
    }
  }

  async function resetAllWizardRules() {
    if (!hostSettingId) return
    setError(null)
    setRulesWizardSuccess(null)
    const current = rules ?? []
    if (current.length === 0) {
      setRulesWizardSuccess('삭제할 규칙이 없습니다.')
      return
    }
    setLoading(true)
    try {
      for (const r of current) {
        await apiDelete(`/api/v1/host/rules/${r.id}`)
      }
      await refetchRulesList()
      setRulesWizardSuccess('모든 운영 규칙을 삭제했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '초기화 실패')
    } finally {
      setLoading(false)
    }
  }

  async function applyTemplateBasic() {
    if (!hostSettingId) return
    setError(null)
    setRulesWizardSuccess(null)
    setLoading(true)
    try {
      const current = rules ?? []
      const toDelete = current.filter(
        (r) => r.rule_type === 'OPEN' && r.day_of_week <= 4,
      )
      for (const r of toDelete) {
        await apiDelete(`/api/v1/host/rules/${r.id}`)
      }
      for (const day of [0, 1, 2, 3, 4]) {
        await apiPostJson(`/api/v1/host/booking-pages/${hostSettingId}/rules`, {
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '18:00:00',
          rule_type: 'OPEN',
        })
      }
      await refetchRulesList()
      setRulesWizardSuccess('평일 09:00–18:00 템플릿을 적용했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '템플릿 적용 실패')
    } finally {
      setLoading(false)
    }
  }

  async function applyTemplateLunch() {
    if (!hostSettingId) return
    setError(null)
    setRulesWizardSuccess(null)
    setLoading(true)
    try {
      const current = rules ?? []
      const toDelete = current.filter((r) => r.day_of_week <= 4)
      for (const r of toDelete) {
        await apiDelete(`/api/v1/host/rules/${r.id}`)
      }
      for (const day of [0, 1, 2, 3, 4]) {
        await apiPostJson(`/api/v1/host/booking-pages/${hostSettingId}/rules`, {
          day_of_week: day,
          start_time: '09:00:00',
          end_time: '18:00:00',
          rule_type: 'OPEN',
        })
      }
      for (const day of [0, 1, 2, 3, 4]) {
        await apiPostJson(`/api/v1/host/booking-pages/${hostSettingId}/rules`, {
          day_of_week: day,
          start_time: '12:00:00',
          end_time: '13:00:00',
          rule_type: 'BREAK',
        })
      }
      await refetchRulesList()
      setRulesWizardSuccess('평일 운영 + 점심 휴게 템플릿을 적용했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '템플릿 적용 실패')
    } finally {
      setLoading(false)
    }
  }

  const refetchWizardStep3Slots = useCallback(async () => {
    if (!hostSettingId) return
    try {
      const res = await apiGetJson<HostSlotsListRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/slots${buildQuery({ from: fromDate, to: toDate })}`,
      )
      setWizardStep3SlotCount(res.data.items.length)
    } catch {
      setWizardStep3SlotCount(0)
    }
  }, [hostSettingId, fromDate, toDate])

  useEffect(() => {
    if (!hostSettingId || step !== 3 || !page) return
    void refetchWizardStep3Slots()
  }, [hostSettingId, step, page, fromDate, toDate, refetchWizardStep3Slots])

  async function onGenerateSlots(e: FormEvent) {
    e.preventDefault()
    if (!hostSettingId) return
    setError(null)
    setGenMsg(null)
    setLoading(true)
    try {
      const res = await apiPostJson<GenRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/slots/generate`,
        { from_date: fromDate, to_date: toDate },
      )
      setGenMsg(
        `생성 ${res.data.generated_count}건, 건너뜀 ${res.data.skipped_count}건`,
      )
      await refetchWizardStep3Slots()
    } catch (err) {
      setError(err instanceof Error ? err.message : '슬롯 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  async function onClearSlots() {
    if (!hostSettingId) return
    if (
      !window.confirm(
        '선택한 기간의 예약 가능·차단 슬롯을 삭제할까요? 예약된 슬롯은 유지됩니다.',
      )
    ) {
      return
    }
    setError(null)
    setGenMsg(null)
    setLoading(true)
    try {
      const res = await apiPostJson<ClearRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/slots/clear`,
        { from_date: fromDate, to_date: toDate },
      )
      setGenMsg(
        `삭제 ${res.data.deleted_count}건, 예약 유지 ${res.data.booked_kept_count}건`,
      )
      await refetchWizardStep3Slots()
    } catch (err) {
      setError(err instanceof Error ? err.message : '슬롯 초기화 실패')
    } finally {
      setLoading(false)
    }
  }

  async function refetchOverrides() {
    if (!hostSettingId) return
    const { from, to } = overridesMonthBounds()
    const res = await apiGetJson<OverridesListRes>(
      `/api/v1/host/booking-pages/${hostSettingId}/overrides${buildQuery({ from, to })}`,
    )
    setOverrides(res.data.items)
  }

  async function onAddOverride(e: FormEvent) {
    e.preventDefault()
    if (!hostSettingId || !overrideDate) return
    setError(null)
    setOverridesMsg(null)

    if (overrideType !== 'DAY_OFF') {
      if (!overrideStartTime || !overrideEndTime) {
        setError('추가 오픈·시간대 차단은 시작·종료 시각이 필요합니다.')
        return
      }
      if (toSec(overrideStartTime) >= toSec(overrideEndTime)) {
        setError('종료 시각은 시작 시각보다 늦어야 합니다.')
        return
      }
      if (
        overrideType === 'BLOCK' &&
        exceptionDaySlots &&
        exceptionDaySlots.length > 0
      ) {
        const openSlots = exceptionDaySlots.filter((s) => s.status === 'OPEN')
        if (openSlots.length > 0) {
          const overlapsOpen = openSlots.some((s) =>
            overlapsUserRangeWithSlot(
              overrideStartTime,
              overrideEndTime,
              s.start_time,
              s.end_time,
            ),
          )
          if (!overlapsOpen) {
            setError(
              '시간대 차단은 아래 목록의 예약 가능(OPEN) 슬롯과 겹치는 구간으로 맞춰 주세요.',
            )
            return
          }
        }
      }
    }

    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        override_date: overrideDate,
        override_type: overrideType,
      }
      if (overrideType !== 'DAY_OFF') {
        body.start_time = normalizeTime(overrideStartTime)
        body.end_time = normalizeTime(overrideEndTime)
      }
      await apiPostJson(
        `/api/v1/host/booking-pages/${hostSettingId}/overrides`,
        body,
      )
      await refetchOverrides()
      setOverridesMsg('예외 일정을 추가했습니다.')
      if (overrideType !== 'DAY_OFF') {
        setOverrideStartTime('')
        setOverrideEndTime('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '예외 일정 추가 실패')
    } finally {
      setLoading(false)
    }
  }

  async function removeOverrideWizard(id: string) {
    if (!hostSettingId) return
    setError(null)
    setOverridesMsg(null)
    setLoading(true)
    try {
      await apiDelete(`/api/v1/host/overrides/${id}`)
      await refetchOverrides()
      setOverridesMsg('예외 일정을 삭제했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setLoading(false)
    }
  }

  async function onActivate() {
    if (!hostSettingId) return
    setError(null)
    setLoading(true)
    try {
      await apiPostJson(`/api/v1/host/booking-pages/${hostSettingId}/complete-setup`, {
        activate: true,
      })
      setActivated(true)
      const one = await apiGetJson<OneRes>(
        `/api/v1/host/booking-pages/${hostSettingId}`,
      )
      setPage(one.data)
      sessionStorage.removeItem(wizardStorageKey())
    } catch (err) {
      setError(err instanceof Error ? err.message : '활성화 실패')
    } finally {
      setLoading(false)
    }
  }

  if (!hostSettingId) return null

  const previewTitle = page?.title?.trim() || '예약 페이지 제목'
  const previewDescription =
    page?.description?.trim() ||
    '운영 규칙과 슬롯 설정이 아직 완료되지 않았어요.'
  const previewListed = page?.is_listed ?? true

  const rulesCount = rules?.length ?? 0
  const stepTitle =
    step === 2
      ? '2. 운영 규칙'
      : step === 3
        ? '3. 슬롯 생성'
        : '4. 예외 일정 (선택)'

  const stepLabelCurrent = activated ? '완료' : stepTitle
  const stepLabelFraction = activated ? 5 : step

  const completeDbSlotsByDate = useMemo(
    () => groupHostSlotsByLocalYmd(completeMonthDbSlots),
    [completeMonthDbSlots],
  )

  const completeCells = useMemo((): DaySummaryCell[] => {
    if (!page || !rules) return []
    return completePreviewMonthGrid(completeViewMonth).map((date) => {
      const cell = buildCompletePreviewDaySummary(
        date,
        completeViewMonth,
        completeMonthOverrides,
        rules,
        page.slot_duration_mins,
      )
      const dbSlots = completeDbSlotsByDate.get(cell.date) ?? []
      return {
        ...cell,
        slots: dbSlots,
        slotCount: dbSlots.length,
      }
    })
  }, [
    page,
    rules,
    completeViewMonth,
    completeMonthOverrides,
    completeDbSlotsByDate,
  ])

  const completeSelected =
    completeCells.find((c) => c.date === completeSelectedDateKey) ??
    completeCells[0] ??
    null

  const completeDetailOverrides = completeSelected
    ? completeSelected.hasDayOff
      ? completeSelected.overrides.filter(
          (o) => o.override_type === 'DAY_OFF',
        )
      : completeSelected.overrides
    : []

  const completeMonthTitle = `${completeViewMonth.getFullYear()}년 ${MONTH_LABELS[completeViewMonth.getMonth()]}`

  return (
    <div className="page-shell hs-page host-edit-layout">
      <aside className="host-edit-layout__sidebar" aria-label="안내 및 미리보기">
        <div className="host-service-new__sidebar-stack">
          <div className="host-edit-layout__sidebar-card">
            <div className="host-edit-layout__toolbar">
              <Link className="page-shell__link" to="/host/services">
                ← 예약 페이지 목록
              </Link>
            </div>
            <p
              className="page-shell__muted"
              style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.45 }}
            >
              단계를 따라 운영 규칙·슬롯·예외 일정을 진행합니다. 저장된 설정은 언제든
              편집할 수 있어요.
            </p>

            <div className="host-service-new__preview-wrap">
              <p
                className="page-shell__muted"
                style={{
                  margin: '0 0 0.5rem',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                미리보기
              </p>
              <article className="hs-card" aria-label="예약 페이지 미리보기">
                <div className="hs-card__hero">
                  <div
                    className="hs-card__hero-bg hs-card__hero-bg--gradient"
                    style={{ background: heroGradient }}
                    aria-hidden
                  />
                  <div className="hs-card__hero-overlay" aria-hidden />
                  <div className="hs-card__badges" aria-label="상태">
                    <span className="hs-pill hs-pill--active">활성</span>
                    <span
                      className={
                        previewListed
                          ? 'hs-pill hs-pill--listed'
                          : 'hs-pill hs-pill--unlisted'
                      }
                    >
                      {previewListed ? '공개' : '비공개'}
                    </span>
                  </div>
                  <div className="hs-card__hero-text">
                    <h2 className="hs-card__hero-title">{previewTitle}</h2>
                    <p className="hs-card__hero-desc">{previewDescription}</p>
                  </div>
                </div>
                <div className="hs-card__footer">
                  <div className="hs-card__footer-url">
                    <p className="hs-card__footer-url-label">공개 URL</p>
                    <p className="hs-card__footer-url-value" title={publicUrl}>
                      {publicUrl}
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </div>

          {page ? (
            <div className="host-edit-layout__sidebar-card">
              <section
                className="host-service-new__sidebar-actions"
                aria-label="진행"
              >
                <p className="host-service-new__sidebar-actions-label">진행</p>

                {!activated && step === 2 ? (
                  <div className="page-shell__actions host-setup__nav">
                    <Link
                      className="page-shell__btn page-shell__btn--ghost"
                      to="/host/services"
                    >
                      취소
                    </Link>
                    <button
                      type="button"
                      className="page-shell__btn"
                      disabled={rulesCount === 0 || loading}
                      onClick={() => {
                        setStep(3)
                        persistStep(3)
                      }}
                    >
                      다음
                    </button>
                  </div>
                ) : null}

                {!activated && step === 3 ? (
                  <div className="page-shell__actions host-setup__nav">
                    <button
                      type="button"
                      className="page-shell__btn page-shell__btn--ghost"
                      onClick={() => {
                        setStep(2)
                        persistStep(2)
                      }}
                    >
                      이전
                    </button>
                    <button
                      type="button"
                      className="page-shell__btn"
                      onClick={() => {
                        setStep(4)
                        persistStep(4)
                      }}
                    >
                      다음
                    </button>
                  </div>
                ) : null}

                {!activated && step === 4 ? (
                  <>
                    <div className="page-shell__actions host-setup__nav">
                      <button
                        type="button"
                        className="page-shell__btn page-shell__btn--ghost"
                        disabled={loading}
                        onClick={() => {
                          setStep(3)
                          persistStep(3)
                        }}
                      >
                        이전
                      </button>
                      <button
                        type="button"
                        className="page-shell__btn"
                        disabled={loading}
                        onClick={() => void onActivate()}
                      >
                        {loading ? '처리 중…' : '완료'}
                      </button>
                    </div>
                    <p className="host-service-new__sidebar-skip">
                      <button
                        type="button"
                        className="page-shell__link"
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          font: 'inherit',
                        }}
                        disabled={loading}
                        onClick={() => void onActivate()}
                      >
                        지금은 건너뛰기
                      </button>
                    </p>
                  </>
                ) : null}

                {activated ? (
                  <div className="page-shell__actions host-setup__nav">
                    <Link
                      className="page-shell__btn"
                      to={`/host/services/${page.slug}/dashboard`}
                    >
                      대시보드
                    </Link>
                    <Link
                      className="page-shell__btn page-shell__btn--ghost"
                      to="/host/services"
                    >
                      목록
                    </Link>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="host-edit-layout__main">
        <div className="host-edit-panel">
          <p className="host-setup__steps" aria-label="진행 단계">
            <span className="host-setup__steps-current">{stepLabelCurrent}</span>
            <span className="page-shell__muted"> · {stepLabelFraction}/5</span>
          </p>
          {step === 2 && page ? (
            <div className="host-setup-rules__title-row">
              <h1 className="page-shell__title">운영 규칙</h1>
              <div className="host-setup-rules__title-status-wrap">
                {error ? (
                  <span
                    className="host-setup-rules__title-status host-setup-rules__title-status--err"
                    role="status"
                  >
                    {error}
                  </span>
                ) : null}
                {rulesWizardSuccess ? (
                  <span
                    className="host-setup-rules__title-status host-setup-rules__title-status--ok"
                    role="status"
                  >
                    {rulesWizardSuccess}
                  </span>
                ) : null}
              </div>
            </div>
          ) : step === 4 && page && !activated ? (
            <h1 className="page-shell__title">예외 일정 (선택)</h1>
          ) : step === 4 && page && activated ? (
            <h1 className="page-shell__title">설정 완료</h1>
          ) : (
            <h1 className="page-shell__title">
              {page?.title ?? '예약 페이지 설정'}
            </h1>
          )}
          {error && !(step === 2 && page) ? (
            <div className="page-shell__error">{error}</div>
          ) : null}

          {!page && !error ? (
            <p className="page-shell__muted">불러오는 중…</p>
          ) : null}

          {step === 2 && page ? (
            <>
              <p className="page-shell__lead">
                예약을 받을 요일과 시간을 정하세요. 운영 시간을 추가하면 슬롯이
                생성되고, 휴게 시간을 추가하면 해당 시간대는 자동으로 제외됩니다.
              </p>

              <div className="host-setup-rules__grid">
                <section className="host-setup-rules__panel">
                  <div className="host-setup-rules__templates">
                    <button
                      type="button"
                      className="host-setup-rules__tpl-btn"
                      disabled={loading}
                      onClick={() => void applyTemplateBasic()}
                    >
                      평일 09:00–18:00
                    </button>
                    <button
                      type="button"
                      className="host-setup-rules__tpl-btn"
                      disabled={loading}
                      onClick={() => void applyTemplateLunch()}
                    >
                      평일 + 점심 휴게
                    </button>
                    <button
                      type="button"
                      className="host-setup-rules__tpl-btn"
                      disabled={loading}
                      onClick={() => applyWizardDays([0, 1, 2, 3, 4])}
                    >
                      요일: 평일 선택
                    </button>
                    <button
                      type="button"
                      className="host-setup-rules__tpl-btn"
                      disabled={loading}
                      onClick={() => applyWizardDays([0, 1, 2, 3, 4, 5, 6])}
                    >
                      요일: 전체 선택
                    </button>
                  </div>

                  <form className="host-setup-rules__form" onSubmit={addRulesWizard}>
                    <div>
                      <div className="host-setup-rules__field-label">유형</div>
                      <div className="host-setup-rules__pill-row">
                        {(['OPEN', 'BREAK'] as const).map((t) => {
                          const active = ruleType === t
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={loading}
                              className={
                                active
                                  ? 'host-setup-rules__pill host-setup-rules__pill--active-dark'
                                  : 'host-setup-rules__pill'
                              }
                              onClick={() => setRuleType(t)}
                            >
                              {ruleKindLabel(t)}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="host-setup-rules__field-label">요일</div>
                      <div className="host-setup-rules__pill-row">
                        {DAYS.map((day, idx) => {
                          const active = selectedDays.includes(idx)
                          return (
                            <button
                              key={day}
                              type="button"
                              disabled={loading}
                              className={
                                active
                                  ? 'host-setup-rules__pill host-setup-rules__pill--active-day'
                                  : 'host-setup-rules__pill'
                              }
                              onClick={() => toggleWizardDay(idx)}
                            >
                              {day}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="host-setup-rules__time-grid">
                      <label>
                        <span>시작</span>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        <span>종료</span>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          required
                        />
                      </label>
                    </div>

                    <div className="host-setup-rules__summary">
                      <div className="host-setup-rules__summary-kicker">
                        적용 미리보기
                      </div>
                      <p>{summaryText}</p>
                    </div>

                    <div className="host-setup-rules__submit-row">
                      <button
                        type="submit"
                        className="host-setup-rules__submit"
                        disabled={loading}
                      >
                        선택한 요일에 적용
                      </button>
                      <button
                        type="button"
                        className="host-setup-rules__reset"
                        disabled={loading}
                        onClick={() => void resetAllWizardRules()}
                      >
                        초기화
                      </button>
                    </div>
                  </form>
                </section>

                <div className="host-setup-rules__week-stack">
                  <div className="host-setup-rules__week-header">
                    <div className="host-setup-rules__week-header-inner">
                      <div>
                        <h2>주간 운영 한눈에 보기</h2>
                        <p>
                          요일별 운영/휴게 시간을 요약과 시간 바로 함께 확인할 수
                          있어요.
                        </p>
                      </div>
                      <div className="host-setup-rules__stat-pills">
                        <span className="host-setup-rules__stat-pill">
                          운영{' '}
                          {(rules ?? []).filter((r) => r.rule_type === 'OPEN').length}
                          개
                        </span>
                        <span className="host-setup-rules__stat-pill host-setup-rules__stat-pill--break">
                          휴게{' '}
                          {(rules ?? []).filter((r) => r.rule_type === 'BREAK').length}
                          개
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="host-setup-rules__week-list">
                    {DAYS.map((day, dayIndex) => {
                      const dayRules = grouped.get(dayIndex) ?? []
                      const openRules = dayRules.filter(
                        (rule) => rule.rule_type === 'OPEN',
                      )
                      const breakRules = dayRules.filter(
                        (rule) => rule.rule_type === 'BREAK',
                      )

                      return (
                        <div key={day} className="host-setup-rules__day-row">
                          <div>
                            <div className="host-setup-rules__day-name">{day}</div>
                            <div className="host-setup-rules__day-sub">
                              {breakRules.length
                                ? `휴게 ${breakRules.length}`
                                : ''}
                            </div>
                          </div>

                          <div className="host-setup-rules__chips">
                            {openRules.length ? (
                              openRules.map((rule) => (
                                <span
                                  key={`open-${rule.id}`}
                                  className="host-setup-rules__chip"
                                >
                                  운영 {toHHMM(rule.start_time)}–
                                  {toHHMM(rule.end_time)}
                                  <button
                                    type="button"
                                    className="host-setup-rules__chip-remove"
                                    aria-label="삭제"
                                    disabled={loading}
                                    onClick={() => void removeWizardRule(rule.id)}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="host-setup-rules__chip host-setup-rules__chip--closed">
                                휴무
                              </span>
                            )}

                            {breakRules.map((rule) => (
                              <span
                                key={`break-${rule.id}`}
                                className="host-setup-rules__chip host-setup-rules__chip--break"
                              >
                                휴게 {toHHMM(rule.start_time)}–
                                {toHHMM(rule.end_time)}
                                <button
                                  type="button"
                                  className="host-setup-rules__chip-remove"
                                  aria-label="삭제"
                                  disabled={loading}
                                  onClick={() => void removeWizardRule(rule.id)}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {step === 3 && page ? (
            <>
              <p className="page-shell__lead">
                기간을 정하고 슬롯을 생성하세요. 규칙이 있는 날만 칸이 생깁니다.
              </p>
              <form
                className="page-shell__form-grid host-service-new__form-grid"
                onSubmit={onGenerateSlots}
              >
                <div className="page-shell__field">
                  <label htmlFor="wiz-from">시작일</label>
                  <input
                    id="wiz-from"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    required
                  />
                </div>
                <div className="page-shell__field">
                  <label htmlFor="wiz-to">종료일</label>
                  <input
                    id="wiz-to"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    required
                  />
                </div>
                <div className="page-shell__actions host-setup__nav page-shell__field--span-2">
                  <button
                    className="page-shell__btn"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? '처리 중…' : '슬롯 생성'}
                  </button>
                  <button
                    type="button"
                    className="page-shell__btn page-shell__btn--ghost"
                    disabled={loading}
                    onClick={() => void onClearSlots()}
                  >
                    슬롯 초기화
                  </button>
                </div>
              </form>
              {genMsg ? <p className="page-shell__muted">{genMsg}</p> : null}
              <p className="page-shell__muted" style={{ marginBottom: '1rem' }}>
                표시 구간: {fromDate} ~ {toDate} (
                {wizardStep3SlotCount === null ? '…' : wizardStep3SlotCount}건)
              </p>
            </>
          ) : null}

          {step === 4 && page && !activated ? (
            <>
              <p className="page-shell__lead">
                특정 날짜를 전체 휴무로 두거나, 추가 오픈·시간대 차단을 넣을 수
                있어요. 이번 달 기준으로 목록을 불러옵니다. 지금은 건너뛰어도
                됩니다.
              </p>
              {overridesMsg ? (
                <p
                  className="page-shell__muted"
                  style={{ color: '#047857', fontWeight: 600 }}
                >
                  {overridesMsg}
                </p>
              ) : null}

              <form
                className="page-shell__form-grid host-service-new__form-grid"
                onSubmit={onAddOverride}
                style={{ marginBottom: '1.25rem' }}
              >
                <div className="page-shell__field">
                  <label htmlFor="wiz-ov-date">날짜</label>
                  <input
                    id="wiz-ov-date"
                    type="date"
                    value={overrideDate}
                    onChange={(e) => setOverrideDate(e.target.value)}
                    required
                  />
                </div>
                <div className="page-shell__field">
                  <label htmlFor="wiz-ov-type">유형</label>
                  <select
                    id="wiz-ov-type"
                    value={overrideType}
                    onChange={(e) => {
                      const v = e.target.value as 'DAY_OFF' | 'OPEN' | 'BLOCK'
                      setOverrideType(v)
                      if (v === 'DAY_OFF') {
                        setOverrideStartTime('')
                        setOverrideEndTime('')
                      }
                    }}
                  >
                    <option value="DAY_OFF">전일 휴무</option>
                    <option value="OPEN">추가 오픈</option>
                    <option value="BLOCK">시간대 차단</option>
                  </select>
                </div>

                {(overrideType === 'OPEN' || overrideType === 'BLOCK') &&
                overrideDate ? (
                  <div className="page-shell__field page-shell__field--span-2 host-setup-overrides__slot-panel">
                    {overrideType === 'BLOCK' ? (
                      <p className="host-setup-overrides__hint">
                        <strong>시간대 차단</strong>은 막을 구간이{' '}
                        <strong>예약 가능(OPEN) 슬롯</strong>과 겹치도록 시작·종료
                        시각을 맞추는 것이 좋습니다. 아래는 선택한 날짜에 이미 생성된
                        슬롯입니다. 가능하면 슬롯의 시작·끝 시각과 맞춰 입력하세요.
                      </p>
                    ) : (
                      <p className="host-setup-overrides__hint">
                        <strong>추가 오픈</strong>은 규칙만으로는 열리지 않는 시간에
                        예약을 받을 때 씁니다. 아래 슬롯 상태를 보고,{' '}
                        <strong>기존 예약 가능 구간과 겹치지 않는</strong> 빈
                        시간대에 시작·종료를 넣어 주세요.
                      </p>
                    )}
                    {exceptionDaySlotsLoading ? (
                      <p className="page-shell__muted">
                        해당 날짜 슬롯을 불러오는 중…
                      </p>
                    ) : exceptionSlotsError ? (
                      <p className="page-shell__muted">
                        슬롯을 불러오지 못했습니다: {exceptionSlotsError}
                      </p>
                    ) : !exceptionDaySlots || exceptionDaySlots.length === 0 ? (
                      <p className="page-shell__muted">
                        이 날짜에 생성된 슬롯이 없습니다. 3단계에서 이 날짜가
                        포함되도록 슬롯을 만든 뒤 다시 확인하면 힌트가 더
                        정확해집니다.
                      </p>
                    ) : (
                      <ul className="host-setup-overrides__slot-list">
                        {exceptionDaySlots.map((s) => (
                          <li key={s.id}>
                            <span className="host-setup-overrides__slot-range">
                              {formatLocalSlotRange(s.start_time, s.end_time)}
                            </span>
                            <span className="host-setup-overrides__slot-status">
                              {slotStatusLabel(s.status)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                {overrideType === 'OPEN' || overrideType === 'BLOCK' ? (
                  <>
                    <div className="page-shell__field">
                      <label htmlFor="wiz-ov-start">시작 시각</label>
                      <input
                        id="wiz-ov-start"
                        type="time"
                        step={60}
                        value={overrideStartTime}
                        onChange={(e) => setOverrideStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="page-shell__field">
                      <label htmlFor="wiz-ov-end">종료 시각</label>
                      <input
                        id="wiz-ov-end"
                        type="time"
                        step={60}
                        value={overrideEndTime}
                        onChange={(e) => setOverrideEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </>
                ) : null}

                <div className="page-shell__actions host-setup__nav page-shell__field--span-2">
                  <button
                    className="page-shell__btn"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? '추가 중…' : '예외 추가'}
                  </button>
                </div>
              </form>

              {overrides === null ? (
                <p className="page-shell__muted">불러오는 중…</p>
              ) : overrides.length === 0 ? (
                <p className="page-shell__muted">이번 달 등록된 예외가 없습니다.</p>
              ) : (
                overrides.map((o) => (
                  <div key={o.id} className="page-shell__card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <span className="page-shell__card-title">
                          {o.override_date} · {overrideTypeLabel(o.override_type)}
                          {o.start_time && o.end_time
                            ? ` · ${toHHMM(o.start_time)}–${toHHMM(o.end_time)}`
                            : ''}
                        </span>
                        {o.reason ? (
                          <p className="page-shell__muted">{o.reason}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="page-shell__btn page-shell__btn--ghost"
                        disabled={loading}
                        onClick={() => void removeOverrideWizard(o.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          ) : null}

          {step === 4 && page && activated ? (
            <div className="host-setup-complete">
              {!rules ? (
                <p className="page-shell__muted">운영 규칙을 불러오는 중…</p>
              ) : (
                <>
                  <section className="host-setup-complete__section">
                    <div className="host-setup-complete__section-head">
                      <div>
                        <p className="host-setup-complete__section-desc">
                          슬롯 수는 숫자로, 휴게·휴무·추가 오픈·차단은 작은 상태
                          사각형으로 표시합니다.
                        </p>
                        <div
                          className="host-setup-complete__legend"
                          aria-label="범례"
                        >
                          <span className="host-setup-complete__legend-title">
                            범례
                          </span>
                          <span className="host-setup-complete__legend-item">
                            <span
                              className="host-setup-complete__legend-dot host-setup-complete__legend-dot--break"
                              aria-hidden
                            />
                            휴게
                          </span>
                          <span className="host-setup-complete__legend-item">
                            <span
                              className="host-setup-complete__legend-dot host-setup-complete__legend-dot--off"
                              aria-hidden
                            />
                            휴무
                          </span>
                          <span className="host-setup-complete__legend-item">
                            <span
                              className="host-setup-complete__legend-dot host-setup-complete__legend-dot--open"
                              aria-hidden
                            />
                            추가 오픈
                          </span>
                          <span className="host-setup-complete__legend-item">
                            <span
                              className="host-setup-complete__legend-dot host-setup-complete__legend-dot--block"
                              aria-hidden
                            />
                            차단
                          </span>
                        </div>
                      </div>
                      <div className="host-setup-complete__month-nav">
                        <button
                          type="button"
                          className="host-setup-complete__month-btn"
                          onClick={() =>
                            setCompleteViewMonth(
                              new Date(
                                completeViewMonth.getFullYear(),
                                completeViewMonth.getMonth() - 1,
                                1,
                              ),
                            )
                          }
                        >
                          이전 달
                        </button>
                        <div className="host-setup-complete__month-label">
                          {completeMonthTitle}
                          {completeOverridesLoading ? (
                            <span className="host-setup-complete__month-loading">
                              불러오는 중…
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="host-setup-complete__month-btn"
                          onClick={() =>
                            setCompleteViewMonth(
                              new Date(
                                completeViewMonth.getFullYear(),
                                completeViewMonth.getMonth() + 1,
                                1,
                              ),
                            )
                          }
                        >
                          다음 달
                        </button>
                      </div>
                    </div>

                    <div className="host-setup-complete__cal-grid">
                      {COMPLETE_CAL_WEEKDAY_LABELS.map((label) => (
                        <div
                          key={label}
                          className="host-setup-complete__cal-weekday"
                        >
                          {label}
                        </div>
                      ))}
                      {completeCells.map((cell) => {
                        const isSelected = cell.date === completeSelectedDateKey
                        const dayNum = Number(cell.date.slice(8, 10))
                        const dayOff = cell.hasDayOff
                        const hasDbSlots = cell.slotCount > 0
                        const showBreakSq =
                          !dayOff &&
                          hasDbSlots &&
                          cell.breakRules.length > 0
                        const showOffSq = dayOff
                        const showOpenSq = !dayOff && cell.hasExtraOpen
                        const showBlockSq = !dayOff && cell.hasBlock
                        const slotHint = dayOff
                          ? '휴무'
                          : cell.slotCount > 0
                            ? `${cell.slots[0]?.start ?? ''}${
                                cell.slots.length > 1
                                  ? `·${cell.slots[cell.slots.length - 1]?.start ?? ''}`
                                  : ''
                              }`
                            : '—'
                        return (
                          <button
                            key={cell.date}
                            type="button"
                            className={[
                              'host-setup-complete__day',
                              isSelected ? 'host-setup-complete__day--selected' : '',
                              cell.isCurrentMonth
                                ? ''
                                : 'host-setup-complete__day--muted',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => setCompleteSelectedDateKey(cell.date)}
                          >
                            <div className="host-setup-complete__day-top">
                              <span
                                className={[
                                  'host-setup-complete__day-num',
                                  !isSelected && cell.isToday
                                    ? 'host-setup-complete__day-num--today'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              >
                                {dayNum}
                              </span>
                              {cell.isToday ? (
                                <span className="host-setup-complete__day-today">
                                  today
                                </span>
                              ) : null}
                            </div>
                            <div className="host-setup-complete__day-mid">
                              {cell.slotCount > 0 ? (
                                <span className="host-setup-complete__day-slots">
                                  슬롯 {cell.slotCount}
                                </span>
                              ) : (
                                <span className="host-setup-complete__day-slots-empty">
                                  슬롯 -
                                </span>
                              )}
                              <span
                                className={[
                                  'host-setup-complete__sq',
                                  showBreakSq
                                    ? 'host-setup-complete__sq--break'
                                    : isSelected
                                      ? 'host-setup-complete__sq--empty-selected'
                                      : 'host-setup-complete__sq--empty',
                                ].join(' ')}
                                title="휴게"
                              />
                              <span
                                className={[
                                  'host-setup-complete__sq',
                                  showOffSq
                                    ? 'host-setup-complete__sq--off'
                                    : isSelected
                                      ? 'host-setup-complete__sq--empty-selected'
                                      : 'host-setup-complete__sq--empty',
                                ].join(' ')}
                                title="휴무"
                              />
                              <span
                                className={[
                                  'host-setup-complete__sq',
                                  showOpenSq
                                    ? 'host-setup-complete__sq--open'
                                    : isSelected
                                      ? 'host-setup-complete__sq--empty-selected'
                                      : 'host-setup-complete__sq--empty',
                                ].join(' ')}
                                title="추가 오픈"
                              />
                              <span
                                className={[
                                  'host-setup-complete__sq',
                                  showBlockSq
                                    ? 'host-setup-complete__sq--block'
                                    : isSelected
                                      ? 'host-setup-complete__sq--empty-selected'
                                      : 'host-setup-complete__sq--empty',
                                ].join(' ')}
                                title="차단"
                              />
                            </div>
                            <div className="host-setup-complete__day-hint">
                              {slotHint}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  {completeSelected ? (
                    <section className="host-setup-complete__section">
                      <div className="host-setup-complete__detail-head">
                        <div>
                          <p className="host-setup-complete__kicker">
                            선택한 날짜
                          </p>
                          <h3 className="host-setup-complete__detail-title">
                            {parseYmd(completeSelected.date).toLocaleDateString(
                              'ko-KR',
                              {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                weekday: 'long',
                              },
                            )}
                          </h3>
                          <p className="host-setup-complete__section-desc">
                            운영 규칙과 예외 일정이 최종적으로 어떻게 반영됐는지
                            보여줍니다.
                          </p>
                        </div>
                        <div className="host-setup-complete__slot-pill">
                          슬롯 {completeSelected.slotCount}개
                        </div>
                      </div>

                      <div className="host-setup-complete__detail-grid">
                        <div className="host-setup-complete__detail-main">
                          <div className="host-setup-complete__card">
                            <div className="host-setup-complete__card-label">
                              운영 규칙
                            </div>
                            <div className="host-setup-complete__chip-row">
                              {completeSelected.openRules.length ? (
                                completeSelected.openRules.map((rule) => (
                                  <span
                                    key={rule.id}
                                    className="host-setup-complete__chip host-setup-complete__chip--open"
                                  >
                                    운영 {toHHMM(rule.start_time)}–
                                    {toHHMM(rule.end_time)}
                                  </span>
                                ))
                              ) : (
                                <span className="host-setup-complete__chip host-setup-complete__chip--muted">
                                  기본 운영 없음
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="host-setup-complete__card">
                            <div className="host-setup-complete__card-label">
                              휴게 시간
                            </div>
                            <div className="host-setup-complete__chip-row">
                              {completeSelected.hasDayOff ? (
                                <span className="host-setup-complete__chip host-setup-complete__chip--muted">
                                  전일 휴무 — 휴게·추가 오픈·차단은 적용되지 않아 표시하지
                                  않습니다.
                                </span>
                              ) : completeSelected.slotCount === 0 ? (
                                <span className="host-setup-complete__chip host-setup-complete__chip--muted">
                                  이 날짜에 저장된 슬롯이 없어 휴게 규칙은 표시하지
                                  않습니다.
                                </span>
                              ) : completeSelected.breakRules.length ? (
                                completeSelected.breakRules.map((rule) => (
                                  <span
                                    key={rule.id}
                                    className="host-setup-complete__chip host-setup-complete__chip--break"
                                  >
                                    휴게 {toHHMM(rule.start_time)}–
                                    {toHHMM(rule.end_time)}
                                  </span>
                                ))
                              ) : (
                                <span className="host-setup-complete__chip host-setup-complete__chip--muted">
                                  휴게 없음
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="host-setup-complete__card">
                            <div className="host-setup-complete__card-label">
                              예외 일정
                            </div>
                            <div className="host-setup-complete__override-stack">
                              {completeDetailOverrides.length ? (
                                completeDetailOverrides.map((override) => (
                                  <div
                                    key={override.id}
                                    className="host-setup-complete__override-item"
                                  >
                                    <div className="host-setup-complete__override-row">
                                      <span className="host-setup-complete__override-type">
                                        {overrideBadgeLabel(
                                          override.override_type,
                                        )}
                                      </span>
                                      {override.start_time &&
                                      override.end_time ? (
                                        <span className="host-setup-complete__override-time">
                                          {toHHMM(override.start_time)}–
                                          {toHHMM(override.end_time)}
                                        </span>
                                      ) : null}
                                    </div>
                                    {override.reason ? (
                                      <p className="host-setup-complete__override-reason">
                                        {override.reason}
                                      </p>
                                    ) : null}
                                  </div>
                                ))
                              ) : (
                                <div className="host-setup-complete__override-empty">
                                  {completeSelected.hasDayOff
                                    ? '표시할 전일 휴무 예외가 없습니다.'
                                    : '이 날짜에는 추가 오픈/차단/휴무 예외가 없습니다.'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <aside className="host-setup-complete__aside">
                          <div className="host-setup-complete__card-label">
                            최종 생성 슬롯
                          </div>
                          {completeSelected.slots.length ? (
                            <div className="host-setup-complete__slot-chips">
                              {completeSelected.slots.map((slot) => (
                                <span
                                  key={`${slot.start}-${slot.end}`}
                                  className="host-setup-complete__slot-chip"
                                >
                                  {slot.start}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="host-setup-complete__aside-empty">
                              최종적으로 생성된 슬롯이 없습니다.
                            </div>
                          )}

                          <div className="host-setup-complete__aside-meta">
                            <ul>
                              <li>
                                <span>첫 슬롯</span>
                                <strong>
                                  {completeSelected.slots[0]?.start ?? '-'}
                                </strong>
                              </li>
                              <li>
                                <span>마지막 슬롯</span>
                                <strong>
                                  {completeSelected.slots[
                                    completeSelected.slots.length - 1
                                  ]?.start ?? '-'}
                                </strong>
                              </li>
                              <li>
                                <span>휴무 여부</span>
                                <strong>
                                  {completeSelected.hasDayOff ? '예' : '아니오'}
                                </strong>
                              </li>
                            </ul>
                          </div>
                        </aside>
                      </div>
                    </section>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
