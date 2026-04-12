import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { HostServiceEditOutletContext } from './hostEditContext'
import { apiDelete, apiGetJson, apiPatchJson, apiPostJson } from '../../lib/api'
import '../page-shell.css'
import './host-edit-layout.css'
import './host-service-setup.css'

type PageData = {
  id: string
  slug: string
  title: string
  description: string | null
  host_timezone: string
  slot_duration_mins: number
  buffer_duration_mins: number
  approval_type: 'AUTO' | 'MANUAL'
  is_active: boolean
  is_listed: boolean
  listing_category: string | null
  setup_completed: boolean
}

type OneRes = { success: true; data: PageData }
type SuccessRes = { success: true; data: PageData }

export function HostServiceBasicEditPage() {
  const { hostSettingId } = useParams<{ hostSettingId: string }>()
  const navigate = useNavigate()
  const { setLiveBasicPreview } =
    useOutletContext<HostServiceEditOutletContext>() ?? {}
  const [loaded, setLoaded] = useState(false)
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hostTimezone, setHostTimezone] = useState('Asia/Seoul')
  const [slotDurationMins, setSlotDurationMins] = useState(30)
  const [approvalType, setApprovalType] = useState<'AUTO' | 'MANUAL'>('MANUAL')
  const [isListed, setIsListed] = useState(true)
  const [listingCategory, setListingCategory] = useState('')
  const [setupCompleted, setSetupCompleted] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hostSettingId) return
    let c = false
    ;(async () => {
      try {
        const res = await apiGetJson<OneRes>(
          `/api/v1/host/booking-pages/${hostSettingId}`,
        )
        if (c) return
        const d = res.data
        setSlug(d.slug)
        setTitle(d.title)
        setDescription(d.description ?? '')
        setHostTimezone(d.host_timezone)
        setSlotDurationMins(d.slot_duration_mins)
        setApprovalType(d.approval_type)
        setIsListed(d.is_listed)
        setListingCategory(d.listing_category ?? '')
        setSetupCompleted(d.setup_completed)
        setIsActive(d.is_active)
        setLoaded(true)
        setError(null)
      } catch (e) {
        if (!c) {
          setError(e instanceof Error ? e.message : '불러오기 실패')
        }
      }
    })()
    return () => {
      c = true
    }
  }, [hostSettingId])

  useEffect(() => {
    if (!setLiveBasicPreview || !loaded) return
    setLiveBasicPreview({
      slug,
      title,
      description,
      is_listed: isListed,
    })
  }, [loaded, slug, title, description, isListed, setLiveBasicPreview])

  useEffect(() => {
    return () => {
      setLiveBasicPreview?.(null)
    }
  }, [setLiveBasicPreview])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!hostSettingId) return
    setError(null)
    setLoading(true)
    try {
      await apiPatchJson<SuccessRes>(
        `/api/v1/host/booking-pages/${hostSettingId}`,
        {
          slug: slug.trim().toLowerCase(),
          title: title.trim(),
          description: description.trim() || null,
          host_timezone: hostTimezone,
          slot_duration_mins: slotDurationMins,
          approval_type: approvalType,
          is_listed: isListed,
          listing_category: listingCategory.trim()
            ? listingCategory.trim()
            : null,
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function onActivate() {
    if (!hostSettingId) return
    setError(null)
    try {
      await apiPostJson<SuccessRes>(
        `/api/v1/host/booking-pages/${hostSettingId}/toggle-active`,
        { is_active: true },
      )
      setIsActive(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '활성화 실패')
    }
  }

  async function onDeleteDraft() {
    if (!hostSettingId) return
    if (!confirm('이 초안 페이지를 삭제할까요?')) return
    setError(null)
    try {
      await apiDelete(`/api/v1/host/booking-pages/${hostSettingId}`)
      navigate('/host/services', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  if (!hostSettingId) return null

  const draft = !setupCompleted

  return (
    <div className="host-edit-panel">
      <h1 className="page-shell__title">기본 정보</h1>
      <p className="page-shell__lead">
        공개 URL은 <code className="page-shell__code">/book/{slug || '…'}</code>{' '}
        입니다. 제목·슬롯 길이·공개 범위 등을 바꿀 수 있어요.
      </p>
      {error ? <div className="page-shell__error">{error}</div> : null}
      {!loaded && !error ? (
        <p className="page-shell__muted">불러오는 중…</p>
      ) : null}
      {loaded ? (
        <>
          <div
            className="page-shell__actions"
            style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}
          >
            {draft ? (
              <Link
                className="page-shell__btn page-shell__btn--ghost"
                to={`/host/services/${hostSettingId}/setup`}
              >
                초안 설정 마법사로 이동
              </Link>
            ) : null}
            {!draft && !isActive ? (
              <button
                type="button"
                className="page-shell__btn"
                onClick={() => void onActivate()}
              >
                예약 페이지 활성화
              </button>
            ) : null}
            {draft ? (
              <button
                type="button"
                className="page-shell__btn page-shell__btn--ghost"
                style={{ color: 'var(--binjari-danger, #b91c1c)' }}
                onClick={() => void onDeleteDraft()}
              >
                초안 삭제
              </button>
            ) : null}
          </div>
          <form
            className="page-shell__form-grid host-service-new__form-grid"
            onSubmit={onSubmit}
          >
            <div className="page-shell__field">
              <label htmlFor="ed-slug">슬러그</label>
              <input
                id="ed-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9-]+"
                title="소문자, 숫자, 하이픈만"
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="ed-title">제목</label>
              <input
                id="ed-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={150}
              />
            </div>
            <div className="page-shell__field page-shell__field--span-2">
              <label htmlFor="ed-desc">짧은 설명 (선택)</label>
              <textarea
                id="ed-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="ed-tz">호스트 타임존</label>
              <input
                id="ed-tz"
                value={hostTimezone}
                onChange={(e) => setHostTimezone(e.target.value)}
                required
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="ed-dur">슬롯 길이(분)</label>
              <input
                id="ed-dur"
                type="number"
                min={1}
                value={slotDurationMins}
                onChange={(e) => setSlotDurationMins(Number(e.target.value))}
                required
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="ed-appr">승인 방식</label>
              <select
                id="ed-appr"
                value={approvalType}
                onChange={(e) =>
                  setApprovalType(e.target.value as 'AUTO' | 'MANUAL')
                }
              >
                <option value="MANUAL">수동 승인</option>
                <option value="AUTO">자동 확정</option>
              </select>
            </div>
            <div className="page-shell__field">
              <label htmlFor="ed-cat">노출 카테고리 (선택)</label>
              <select
                id="ed-cat"
                value={listingCategory}
                onChange={(e) => setListingCategory(e.target.value)}
              >
                <option value="">미분류</option>
                <option value="과외">과외</option>
                <option value="상담">상담</option>
                <option value="인터뷰">인터뷰</option>
                <option value="시설">시설</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div className="page-shell__field page-shell__field--span-2">
              <label htmlFor="ed-listed">
                <input
                  id="ed-listed"
                  type="checkbox"
                  checked={isListed}
                  onChange={(e) => setIsListed(e.target.checked)}
                />{' '}
                마켓플레이스에 공개 (비공개면 직접 링크만)
              </label>
            </div>
            <div className="page-shell__field page-shell__field--span-2">
              <button className="page-shell__btn" type="submit" disabled={loading}>
                {loading ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  )
}
