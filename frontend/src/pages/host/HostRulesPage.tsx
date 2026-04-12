import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { HostServiceEditOutletContext } from './hostEditContext'
import { apiDelete, apiGetJson, apiPostJson } from '../../lib/api'
import {
  OPERATING_RULE_DAYS as DAYS,
  buildDayMap,
  normalizeTime,
  ruleKindLabel,
  toHHMM,
  validateWizardDraft,
} from './hostOperatingRules'
import type { HostOperatingRule } from './hostOperatingRules'
import '../page-shell.css'
import './host-service-setup.css'

type Rule = HostOperatingRule

type ListRes = { success: true; data: { items: Rule[] } }

export function HostRulesPage() {
  const { embedded } =
    useOutletContext<HostServiceEditOutletContext>() ?? {}
  const { hostSettingId } = useParams<{ hostSettingId: string }>()
  const [items, setItems] = useState<Rule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rulesSuccess, setRulesSuccess] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [ruleType, setRuleType] = useState<'OPEN' | 'BREAK'>('OPEN')
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!hostSettingId) return
    const res = await apiGetJson<ListRes>(
      `/api/v1/host/booking-pages/${hostSettingId}/rules`,
    )
    setItems(res.data.items)
  }

  useEffect(() => {
    if (!hostSettingId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<ListRes>(
          `/api/v1/host/booking-pages/${hostSettingId}/rules`,
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
  }, [hostSettingId])

  useEffect(() => {
    setRulesSuccess(null)
  }, [selectedDays, ruleType, startTime, endTime])

  const grouped = useMemo(() => buildDayMap(items ?? []), [items])

  const summaryText = useMemo(() => {
    if (!selectedDays.length) return '요일을 하나 이상 선택해 주세요.'
    const dayText = selectedDays.map((d) => DAYS[d]).join(', ')
    return `${dayText}에 ${ruleKindLabel(ruleType)} ${startTime}–${endTime}를 적용합니다.`
  }, [selectedDays, ruleType, startTime, endTime])

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
    setRulesSuccess(null)
    const invalid = validateWizardDraft(
      items ?? [],
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
      await load()
      setRulesSuccess(`${selectedDays.length}개 요일에 규칙을 적용했습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '규칙 추가 실패')
    } finally {
      setLoading(false)
    }
  }

  async function removeWizardRule(id: string) {
    if (!hostSettingId) return
    setError(null)
    setRulesSuccess(null)
    setLoading(true)
    try {
      await apiDelete(`/api/v1/host/rules/${id}`)
      await load()
      setRulesSuccess('규칙을 삭제했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setLoading(false)
    }
  }

  async function resetAllWizardRules() {
    if (!hostSettingId) return
    setError(null)
    setRulesSuccess(null)
    const current = items ?? []
    if (current.length === 0) {
      setRulesSuccess('삭제할 규칙이 없습니다.')
      return
    }
    setLoading(true)
    try {
      for (const r of current) {
        await apiDelete(`/api/v1/host/rules/${r.id}`)
      }
      await load()
      setRulesSuccess('모든 운영 규칙을 삭제했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '초기화 실패')
    } finally {
      setLoading(false)
    }
  }

  async function applyTemplateBasic() {
    if (!hostSettingId) return
    setError(null)
    setRulesSuccess(null)
    setLoading(true)
    try {
      const current = items ?? []
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
      await load()
      setRulesSuccess('평일 09:00–18:00 템플릿을 적용했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '템플릿 적용 실패')
    } finally {
      setLoading(false)
    }
  }

  async function applyTemplateLunch() {
    if (!hostSettingId) return
    setError(null)
    setRulesSuccess(null)
    setLoading(true)
    try {
      const current = items ?? []
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
      await load()
      setRulesSuccess('평일 운영 + 점심 휴게 템플릿을 적용했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '템플릿 적용 실패')
    } finally {
      setLoading(false)
    }
  }

  const shellClass = embedded ? 'host-edit-panel' : 'page-shell'
  const TitleTag = embedded ? 'h2' : 'h1'

  const titleBlock = embedded ? (
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
        {rulesSuccess ? (
          <span
            className="host-setup-rules__title-status host-setup-rules__title-status--ok"
            role="status"
          >
            {rulesSuccess}
          </span>
        ) : null}
      </div>
    </div>
  ) : (
    <>
      <TitleTag className="page-shell__title">운영 규칙</TitleTag>
      {error ? <div className="page-shell__error">{error}</div> : null}
      {rulesSuccess ? (
        <p className="page-shell__muted" style={{ color: '#047857', fontWeight: 600 }}>
          {rulesSuccess}
        </p>
      ) : null}
    </>
  )

  return (
    <div className={shellClass}>
      {titleBlock}
      <p className="page-shell__lead">
        예약을 받을 요일과 시간을 정하세요. 운영 시간을 추가하면 슬롯이 생성되고, 휴게
        시간을 추가하면 해당 시간대는 자동으로 제외됩니다.
      </p>
      {!embedded ? (
        <div className="page-shell__actions">
          <Link className="page-shell__link" to={`/host/services/${hostSettingId}/slots`}>
            슬롯 관리
          </Link>
          <Link className="page-shell__link" to={`/host/services/${hostSettingId}/overrides`}>
            예외 일정
          </Link>
          <Link className="page-shell__link" to="/host/services">
            목록
          </Link>
        </div>
      ) : null}

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
              <div className="host-setup-rules__summary-kicker">적용 미리보기</div>
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
                  요일별 운영/휴게 시간을 요약과 시간 바로 함께 확인할 수 있어요.
                </p>
              </div>
              <div className="host-setup-rules__stat-pills">
                <span className="host-setup-rules__stat-pill">
                  운영 {(items ?? []).filter((r) => r.rule_type === 'OPEN').length}개
                </span>
                <span className="host-setup-rules__stat-pill host-setup-rules__stat-pill--break">
                  휴게 {(items ?? []).filter((r) => r.rule_type === 'BREAK').length}개
                </span>
              </div>
            </div>
          </div>

          <div className="host-setup-rules__week-list">
            {items === null ? (
              <p className="page-shell__muted" style={{ gridColumn: '1 / -1' }}>
                불러오는 중…
              </p>
            ) : (
              DAYS.map((day, dayIndex) => {
                const dayRules = grouped.get(dayIndex) ?? []
                const openRules = dayRules.filter((r) => r.rule_type === 'OPEN')
                const breakRules = dayRules.filter((r) => r.rule_type === 'BREAK')

                return (
                  <div key={day} className="host-setup-rules__day-row">
                    <div>
                      <div className="host-setup-rules__day-name">{day}</div>
                      <div className="host-setup-rules__day-sub">
                        {breakRules.length ? `휴게 ${breakRules.length}` : ''}
                      </div>
                    </div>

                    <div className="host-setup-rules__chips">
                      {openRules.length ? (
                        openRules.map((rule) => (
                          <span key={`open-${rule.id}`} className="host-setup-rules__chip">
                            운영 {toHHMM(rule.start_time)}–{toHHMM(rule.end_time)}
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
                          휴게 {toHHMM(rule.start_time)}–{toHHMM(rule.end_time)}
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
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
