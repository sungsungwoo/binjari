import { useMemo, useState } from 'react'
import './HeroCalendarMock.css'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate()
}

function startWeekday(y: number, m: number) {
  return new Date(y, m, 1).getDay()
}

function startOfLocalDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isPastDay(y: number, monthIndex: number, day: number) {
  const cell = startOfLocalDay(new Date(y, monthIndex, day))
  const today = startOfLocalDay(new Date())
  return cell < today
}

function isToday(y: number, monthIndex: number, day: number) {
  const n = new Date()
  return (
    n.getFullYear() === y &&
    n.getMonth() === monthIndex &&
    n.getDate() === day
  )
}

type Slot = { t: string; label: string; open: boolean }

/** 요일·날짜에 따라 슬롯 구성이 달라짐 (데모이지만 반응이 느껴지도록) */
function slotsForDay(y: number, monthIndex: number, day: number): Slot[] {
  const wd = new Date(y, monthIndex, day).getDay()
  if (wd === 0 || wd === 6) {
    return [
      { t: '10:00', label: '오전', open: true },
      { t: '11:30', label: '오전', open: true },
      { t: '15:00', label: '오후', open: day % 2 === 0 },
    ]
  }
  return [
    { t: '09:00', label: '오전', open: true },
    { t: '10:00', label: '오전', open: true },
    { t: '14:00', label: '오후', open: true },
    { t: '16:30', label: '오후', open: day % 3 !== 0 },
    { t: '18:00', label: '저녁', open: true },
  ]
}

function firstSelectableDay(y: number, monthIndex: number, total: number) {
  for (let d = 1; d <= total; d++) {
    if (!isPastDay(y, monthIndex, d)) return d
  }
  return null
}

/**
 * 랜딩 히어로용 인터랙티브 데모 캘린더.
 * — 날짜·슬롯 클릭 시 상태가 바뀌고, 선택 완료 메시지가 표시됩니다.
 * — 실제 예약 API는 호출하지 않습니다.
 */
export function HeroCalendarMock() {
  const now = new Date()
  const [y, setY] = useState(now.getFullYear())
  const [m, setM] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(() => {
    const total = daysInMonth(now.getFullYear(), now.getMonth())
    return firstSelectableDay(now.getFullYear(), now.getMonth(), total)
  })
  const [pickedSlot, setPickedSlot] = useState<string | null>(null)

  const cells = useMemo(() => {
    const total = daysInMonth(y, m)
    const pad = startWeekday(y, m)
    const out: (number | null)[] = []
    for (let i = 0; i < pad; i++) out.push(null)
    for (let d = 1; d <= total; d++) out.push(d)
    return out
  }, [y, m])

  const openSlots = useMemo(() => {
    if (selectedDay == null) return []
    return slotsForDay(y, m, selectedDay).filter((s) => s.open)
  }, [y, m, selectedDay])

  const closedSlots = useMemo(() => {
    if (selectedDay == null) return []
    return slotsForDay(y, m, selectedDay).filter((s) => !s.open)
  }, [y, m, selectedDay])

  function goMonth(delta: number) {
    const d = new Date(y, m + delta, 1)
    const ny = d.getFullYear()
    const nm = d.getMonth()
    const total = daysInMonth(ny, nm)
    const first = firstSelectableDay(ny, nm, total)
    setY(ny)
    setM(nm)
    setSelectedDay(first)
    setPickedSlot(null)
  }

  function selectDay(day: number) {
    if (isPastDay(y, m, day)) return
    setSelectedDay(day)
    setPickedSlot(null)
  }

  const monthLabel = `${y}년 ${m + 1}월`
  const pickedSummary =
    pickedSlot && selectedDay != null
      ? `${m + 1}월 ${selectedDay}일 ${pickedSlot}`
      : null

  return (
    <div
      className="hero-cal"
      role="region"
      aria-label="예약 가능 시간 데모. 날짜와 시간을 눌러 동작을 확인할 수 있습니다."
    >
      <div className="hero-cal__chrome">
        <span className="hero-cal__dots" aria-hidden />
        <span className="hero-cal__title">예약 가능 시간 (데모)</span>
      </div>
      <div className="hero-cal__body">
        <div className="hero-cal__toolbar">
          <button
            type="button"
            className="hero-cal__nav"
            onClick={() => goMonth(-1)}
            aria-label="이전 달"
          >
            ‹
          </button>
          <span className="hero-cal__month" aria-live="polite">
            {monthLabel}
          </span>
          <button
            type="button"
            className="hero-cal__nav"
            onClick={() => goMonth(1)}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
        <div className="hero-cal__weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w} className="hero-cal__wd">
              {w}
            </span>
          ))}
        </div>
        <div className="hero-cal__grid" role="grid" aria-label={`${monthLabel} 날짜`}>
          {cells.map((d, i) =>
            d == null ? (
              <span
                key={`e-${i}`}
                className="hero-cal__cell hero-cal__cell--empty"
              />
            ) : (
              <button
                key={d}
                type="button"
                role="gridcell"
                disabled={isPastDay(y, m, d)}
                className={
                  'hero-cal__cell' +
                  (selectedDay === d ? ' hero-cal__cell--selected' : '') +
                  (isPastDay(y, m, d) ? ' hero-cal__cell--disabled' : '') +
                  (isToday(y, m, d) ? ' hero-cal__cell--today' : '')
                }
                onClick={() => selectDay(d)}
                aria-pressed={selectedDay === d}
                aria-label={
                  isPastDay(y, m, d)
                    ? `${d}일 (지난 날짜)` // still disabled
                    : `${d}일 선택`
                }
              >
                {d}
              </button>
            )
          )}
        </div>

        {selectedDay != null ? (
          <div className="hero-cal__slots">
            <p className="hero-cal__slots-label" id="hero-cal-slots-h">
              {m + 1}월 {selectedDay}일 · 예약 가능 슬롯
            </p>
            {openSlots.length > 0 ? (
              <ul className="hero-cal__slot-list" aria-labelledby="hero-cal-slots-h">
                {openSlots.map((s) => (
                  <li key={s.t}>
                    <button
                      type="button"
                      className={
                        'hero-cal__slot' +
                        (pickedSlot === s.t ? ' hero-cal__slot--picked' : '')
                      }
                      onClick={() => setPickedSlot(s.t)}
                      aria-pressed={pickedSlot === s.t}
                    >
                      <span className="hero-cal__slot-time">{s.t}</span>
                      <span className="hero-cal__slot-meta">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hero-cal__slots-empty">이 날짜에는 열린 슬롯이 없습니다.</p>
            )}
            {closedSlots.length > 0 ? (
              <p className="hero-cal__slots-closed" aria-hidden>
                마감 {closedSlots.map((x) => x.t).join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {pickedSummary ? (
          <div className="hero-cal__result" role="status" aria-live="polite">
            <strong>선택함</strong>
            <span>{pickedSummary}</span>
            <span className="hero-cal__result-hint">
              실제 예약은 로그인 후 공개 예약 페이지에서 진행됩니다.
            </span>
          </div>
        ) : (
          <p className="hero-cal__hint">
            날짜를 누른 뒤 시간을 고르면 선택이 완료됩니다.
          </p>
        )}
      </div>
    </div>
  )
}
