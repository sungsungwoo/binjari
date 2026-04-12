/** 월요일=0 … 일요일=6 (백엔드 day_of_week) */
export const OPERATING_RULE_DAYS = [
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
  '일',
] as const

export type HostOperatingRule = {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  rule_type: 'OPEN' | 'BREAK'
}

export function toHHMM(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value
}

export function toSec(value: string) {
  const normalized = value.length === 5 ? `${value}:00` : value
  const parts = normalized.split(':').map(Number)
  const hh = parts[0] ?? 0
  const mm = parts[1] ?? 0
  const ss = parts[2] ?? 0
  return hh * 3600 + mm * 60 + ss
}

export function normalizeTime(value: string) {
  return value.length === 5 ? `${value}:00` : value
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toSec(aStart) < toSec(bEnd) && toSec(bStart) < toSec(aEnd)
}

export function ruleKindLabel(type: 'OPEN' | 'BREAK') {
  return type === 'OPEN' ? '운영 시간' : '휴게 시간'
}

function sortRules(items: HostOperatingRule[]) {
  return [...items].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
    if (a.rule_type !== b.rule_type) return a.rule_type === 'OPEN' ? -1 : 1
    return toSec(a.start_time) - toSec(b.start_time)
  })
}

export function buildDayMap(items: HostOperatingRule[]) {
  const map = new Map<number, HostOperatingRule[]>()
  for (let i = 0; i < 7; i += 1) map.set(i, [])
  for (const item of sortRules(items)) {
    map.get(item.day_of_week)?.push(item)
  }
  return map
}

export function validateWizardDraft(
  items: HostOperatingRule[],
  selectedDays: number[],
  ruleType: 'OPEN' | 'BREAK',
  startTime: string,
  endTime: string,
): string | null {
  if (!selectedDays.length) return '요일을 하나 이상 선택해 주세요.'
  if (toSec(startTime) >= toSec(endTime))
    return '종료 시간은 시작 시간보다 늦어야 합니다.'

  for (const day of selectedDays) {
    const dayRules = items.filter((rule) => rule.day_of_week === day)
    const openRules = dayRules.filter((rule) => rule.rule_type === 'OPEN')
    const breakRules = dayRules.filter((rule) => rule.rule_type === 'BREAK')

    if (ruleType === 'OPEN') {
      const duplicated = openRules.some((rule) =>
        overlaps(
          startTime,
          endTime,
          toHHMM(rule.start_time),
          toHHMM(rule.end_time),
        ),
      )
      if (duplicated)
        return `${OPERATING_RULE_DAYS[day]}요일에 겹치는 운영 시간이 이미 있습니다.`
    }

    if (ruleType === 'BREAK') {
      const insideOpen = openRules.some(
        (rule) =>
          toSec(startTime) >= toSec(rule.start_time) &&
          toSec(endTime) <= toSec(rule.end_time),
      )
      if (!insideOpen)
        return `${OPERATING_RULE_DAYS[day]}요일 휴게 시간은 기존 운영 시간 안에서만 추가할 수 있습니다.`

      const duplicated = breakRules.some((rule) =>
        overlaps(
          startTime,
          endTime,
          toHHMM(rule.start_time),
          toHHMM(rule.end_time),
        ),
      )
      if (duplicated)
        return `${OPERATING_RULE_DAYS[day]}요일에 겹치는 휴게 시간이 이미 있습니다.`
    }
  }

  return null
}
