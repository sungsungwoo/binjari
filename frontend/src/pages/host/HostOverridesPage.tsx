import { type FormEvent, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { HostServiceEditOutletContext } from './hostEditContext'
import { apiDelete, apiGetJson, apiPostJson, buildQuery } from '../../lib/api'
import '../page-shell.css'
import './host-service-setup.css'

type Override = {
  id: string
  override_date: string
  override_type: 'DAY_OFF' | 'OPEN' | 'BLOCK'
  start_time: string | null
  end_time: string | null
  reason: string | null
}

type ListRes = { success: true; data: { items: Override[] } }

function overrideTypeLabel(t: Override['override_type']) {
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

function monthBounds() {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth() + 1
  const pad = (x: number) => String(x).padStart(2, '0')
  const from = `${y}-${pad(m)}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${pad(m)}-${pad(last)}`
  return { from, to }
}

export function HostOverridesPage() {
  const { embedded } =
    useOutletContext<HostServiceEditOutletContext>() ?? {}
  const { hostSettingId } = useParams<{ hostSettingId: string }>()
  const [items, setItems] = useState<Override[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [overrideDate, setOverrideDate] = useState('')
  const [overrideType, setOverrideType] = useState<'DAY_OFF' | 'OPEN' | 'BLOCK'>('DAY_OFF')
  const [loading, setLoading] = useState(false)

  async function refresh() {
    if (!hostSettingId) return
    const { from, to } = monthBounds()
    const res = await apiGetJson<ListRes>(
      `/api/v1/host/booking-pages/${hostSettingId}/overrides${buildQuery({ from, to })}`
    )
    setItems(res.data.items)
  }

  useEffect(() => {
    if (!hostSettingId) return
    let cancelled = false
    ;(async () => {
      try {
        const { from, to } = monthBounds()
        const res = await apiGetJson<ListRes>(
          `/api/v1/host/booking-pages/${hostSettingId}/overrides${buildQuery({ from, to })}`
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!hostSettingId || !overrideDate) return
    setError(null)
    setLoading(true)
    try {
      await apiPostJson(`/api/v1/host/booking-pages/${hostSettingId}/overrides`, {
        override_date: overrideDate,
        override_type: overrideType,
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setLoading(false)
    }
  }

  async function removeOverride(id: string) {
    if (!confirm('삭제할까요?')) return
    try {
      await apiDelete(`/api/v1/host/overrides/${id}`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const shellClass = embedded ? 'host-edit-panel' : 'page-shell'
  const TitleTag = embedded ? 'h2' : 'h1'

  return (
    <div className={shellClass}>
      {embedded ? (
        <h1 className="page-shell__title">예외 일정 (선택)</h1>
      ) : (
        <TitleTag className="page-shell__title">예외 일정</TitleTag>
      )}
      <p className="page-shell__lead">
        특정 날짜를 전체 휴무로 두거나, 추가 오픈·시간대 차단을 넣을 수 있어요. 이번 달
        기준으로 목록을 불러옵니다.
      </p>
      {!embedded ? (
        <div className="page-shell__actions">
          <Link className="page-shell__link" to={`/host/services/${hostSettingId}/rules`}>
            운영 규칙
          </Link>
          <Link className="page-shell__link" to={`/host/services/${hostSettingId}/slots`}>
            슬롯
          </Link>
        </div>
      ) : null}
      {error ? <div className="page-shell__error">{error}</div> : null}

      <form
        className="page-shell__form-grid host-service-new__form-grid"
        onSubmit={onSubmit}
        style={{ marginBottom: '1.25rem' }}
      >
        <div className="page-shell__field">
          <label htmlFor="ov-date">날짜</label>
          <input
            id="ov-date"
            type="date"
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
            required
          />
        </div>
        <div className="page-shell__field">
          <label htmlFor="ov-type">유형</label>
          <select
            id="ov-type"
            value={overrideType}
            onChange={(e) =>
              setOverrideType(e.target.value as 'DAY_OFF' | 'OPEN' | 'BLOCK')
            }
          >
            <option value="DAY_OFF">전일 휴무</option>
            <option value="OPEN">추가 오픈</option>
            <option value="BLOCK">시간대 차단</option>
          </select>
        </div>
        <div className="page-shell__actions host-setup__nav page-shell__field--span-2">
          <button className="page-shell__btn" type="submit" disabled={loading}>
            {loading ? '추가 중…' : '예외 추가'}
          </button>
        </div>
      </form>

      {items === null ? (
        <p className="page-shell__muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="page-shell__muted">이번 달 등록된 예외가 없습니다.</p>
      ) : (
        items.map((o) => (
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
                </span>
                {o.reason ? <p className="page-shell__muted">{o.reason}</p> : null}
              </div>
              <button
                type="button"
                className="page-shell__btn page-shell__btn--ghost"
                onClick={() => removeOverride(o.id)}
              >
                삭제
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
