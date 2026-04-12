import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { HostServiceEditOutletContext } from './hostEditContext'
import { apiGetJson, apiPostJson, buildQuery } from '../../lib/api'
import { defaultSlotRange } from './hostSlotsShared'
import '../page-shell.css'
import './host-service-setup.css'

type ListRes = { success: true; data: { items: unknown[] } }
type GenRes = {
  success: true
  data: {
    generated_count: number
    skipped_count: number
    from_date: string
    to_date: string
  }
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

function friendlySlotClearError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('foreign key') ||
    lower.includes('violates foreign key') ||
    lower.includes('integrity') ||
    lower.includes('referenced') ||
    lower.includes('bookings_slot_id_fkey')
  ) {
    return '예약과 연결된 시간은 삭제할 수 없습니다. 예약이 있거나 예약 이력이 남아 있는 슬롯은 그대로 유지됩니다.'
  }
  if (
    lower.includes('sqlalchemy') ||
    lower.includes('asyncpg') ||
    raw.length > 280
  ) {
    return '슬롯 초기화 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }
  return raw.trim() || '슬롯 초기화에 실패했습니다.'
}

export function HostSlotsPage() {
  const { embedded } =
    useOutletContext<HostServiceEditOutletContext>() ?? {}
  const { hostSettingId } = useParams<{ hostSettingId: string }>()
  const [fromDate, setFromDate] = useState(defaultSlotRange().from)
  const [toDate, setToDate] = useState(defaultSlotRange().to)
  const [slotCount, setSlotCount] = useState<number | null>(null)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [clearNotice, setClearNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadSlots = useCallback(async () => {
    if (!hostSettingId) return
    try {
      const res = await apiGetJson<ListRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/slots${buildQuery({ from: fromDate, to: toDate })}`,
      )
      setSlotCount(res.data.items.length)
    } catch {
      setSlotCount(0)
    }
  }, [hostSettingId, fromDate, toDate])

  useEffect(() => {
    if (!hostSettingId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<ListRes>(
          `/api/v1/host/booking-pages/${hostSettingId}/slots${buildQuery({ from: fromDate, to: toDate })}`,
        )
        if (!cancelled) {
          setSlotCount(res.data.items.length)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '슬롯 조회 실패')
          setSlotCount(0)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hostSettingId, fromDate, toDate])

  async function onGenerate(e: FormEvent) {
    e.preventDefault()
    if (!hostSettingId) return
    setError(null)
    setGenMsg(null)
    setClearNotice(null)
    setLoading(true)
    try {
      const res = await apiPostJson<GenRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/slots/generate`,
        { from_date: fromDate, to_date: toDate },
      )
      setGenMsg(
        `생성 ${res.data.generated_count}건, 건너뜀 ${res.data.skipped_count}건`,
      )
      await loadSlots()
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
    setClearNotice(null)
    setLoading(true)
    try {
      const res = await apiPostJson<ClearRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/slots/clear`,
        { from_date: fromDate, to_date: toDate },
      )
      const del = res.data.deleted_count
      const kept = res.data.booked_kept_count
      setGenMsg(
        del > 0
          ? `예약이 없는 슬롯 ${del}건을 삭제했습니다.`
          : '삭제할 수 있는 빈 슬롯이 없었습니다.',
      )
      setClearNotice(
        kept > 0
          ? `이 기간에 예약이 있거나(진행·확정), 취소·거절 등 예약 이력이 남아 있는 시간 ${kept}건은 삭제하지 않고 유지했습니다.`
          : null,
      )
      await loadSlots()
    } catch (err) {
      setError(friendlySlotClearError(err))
    } finally {
      setLoading(false)
    }
  }

  const shellClass = embedded ? 'host-edit-panel' : 'page-shell'
  const TitleTag = embedded ? 'h2' : 'h1'

  return (
    <div className={shellClass}>
      {embedded ? (
        <h1 className="page-shell__title">슬롯 생성</h1>
      ) : (
        <TitleTag className="page-shell__title">슬롯 생성</TitleTag>
      )}
      <p className="page-shell__lead">
        기간을 정하고 슬롯을 생성하세요. 규칙이 있는 날만 칸이 생깁니다.
      </p>
      {!embedded ? (
        <div className="page-shell__actions">
          <Link className="page-shell__link" to={`/host/services/${hostSettingId}/rules`}>
            운영 규칙
          </Link>
          <Link className="page-shell__link" to="/host/services">
            목록
          </Link>
        </div>
      ) : null}
      {error ? <div className="page-shell__error">{error}</div> : null}

      <form
        className="page-shell__form-grid host-service-new__form-grid"
        onSubmit={onGenerate}
      >
        <div className="page-shell__field">
          <label htmlFor="sl-from">시작일</label>
          <input
            id="sl-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            required
          />
        </div>
        <div className="page-shell__field">
          <label htmlFor="sl-to">종료일</label>
          <input
            id="sl-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            required
          />
        </div>
        <div className="page-shell__actions host-setup__nav page-shell__field--span-2">
          <button className="page-shell__btn" type="submit" disabled={loading}>
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
      {clearNotice ? (
        <div className="page-shell__notice" role="status">
          {clearNotice}
        </div>
      ) : null}
      {genMsg ? <p className="page-shell__muted">{genMsg}</p> : null}
      <p className="page-shell__muted" style={{ marginBottom: '1rem' }}>
        표시 구간: {fromDate} ~ {toDate} (
        {slotCount === null ? '…' : slotCount}건)
      </p>
    </div>
  )
}
