import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiPostJson } from '../../lib/api'
import { coverGradient } from './BookingPageCoverHero'
import '../page-shell.css'
import './host-services.css'
import './host-edit-layout.css'
import './host-service-setup.css'

type CreateRes = {
  success: true
  data: { id: string; slug: string }
}

export function HostServiceNewPage() {
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [hostTimezone, setHostTimezone] = useState('Asia/Seoul')
  const [slotDurationMins, setSlotDurationMins] = useState(30)
  const [approvalType, setApprovalType] = useState<'AUTO' | 'MANUAL'>('MANUAL')
  const [isListed, setIsListed] = useState(true)
  const [listingCategory, setListingCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const publicUrl = useMemo(() => {
    const s = slug.trim().toLowerCase()
    return `/book/${s || 'my-studio'}`
  }, [slug])

  const previewTitle = title.trim() || '예약 페이지 제목'
  const previewDescription =
    description.trim() ||
    '운영 규칙과 슬롯 설정이 아직 완료되지 않았어요.'
  const heroGradient = useMemo(
    () => coverGradient((slug.trim().toLowerCase() || 'new') + '-preview'),
    [slug],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await apiPostJson<CreateRes>('/api/v1/host/booking-pages', {
        slug: slug.trim().toLowerCase(),
        title: title.trim(),
        description: description.trim() || null,
        host_timezone: hostTimezone,
        slot_duration_mins: slotDurationMins,
        buffer_duration_mins: 0,
        approval_type: approvalType,
        is_listed: isListed,
        listing_category: listingCategory.trim()
          ? listingCategory.trim()
          : null,
        start_as_draft: true,
      })
      navigate(`/host/services/${res.data.id}/setup`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

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
              저장 후 설정 마법사로 이어지며, 이후 편집 화면에서 운영 규칙·슬롯·예외
              일정을 다룰 수 있어요.
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
                        isListed
                          ? 'hs-pill hs-pill--listed'
                          : 'hs-pill hs-pill--unlisted'
                      }
                    >
                      {isListed ? '공개' : '비공개'}
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

          <div className="host-edit-layout__sidebar-card">
            <section
              className="host-service-new__sidebar-actions"
              aria-label="취소 및 다음"
            >
              <p className="host-service-new__sidebar-actions-label">진행</p>
              <div className="page-shell__actions host-setup__nav">
                <Link
                  className="page-shell__btn page-shell__btn--ghost"
                  to="/host/services"
                >
                  취소
                </Link>
                <button
                  className="page-shell__btn"
                  type="submit"
                  form="host-service-new-form"
                  disabled={loading}
                >
                  {loading ? '저장 중…' : '다음'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </aside>
      <main className="host-edit-layout__main">
        <div className="host-edit-panel">
          <p className="host-setup__steps">
            <span className="host-setup__steps-current">
              1. 예약 페이지 만들기
            </span>
            <span className="page-shell__muted"> · 1/5</span>
          </p>
          <h1 className="page-shell__title">예약 페이지 만들기</h1>
          <p className="page-shell__lead">
            기본 정보를 저장하면 초안이 만들어지고, 이어서 운영 규칙·슬롯·예외 순으로
            진행합니다. 마지막에 활성화할 수 있어요.
          </p>
          {error ? <div className="page-shell__error">{error}</div> : null}
          <form
            id="host-service-new-form"
            className="page-shell__form-grid host-service-new__form-grid"
            onSubmit={onSubmit}
          >
            <div className="page-shell__field">
              <label htmlFor="hs-slug">슬러그</label>
              <input
                id="hs-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-studio"
                required
                pattern="[a-z0-9-]+"
                title="소문자, 숫자, 하이픈만"
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="hs-title">제목</label>
              <input
                id="hs-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예약 페이지 제목"
                required
                maxLength={150}
              />
            </div>
            <div className="page-shell__field page-shell__field--span-2">
              <label htmlFor="hs-desc">짧은 설명 (선택)</label>
              <textarea
                id="hs-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="예약 페이지에 노출할 한 줄 소개"
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="hs-tz">호스트 타임존</label>
              <input
                id="hs-tz"
                value={hostTimezone}
                onChange={(e) => setHostTimezone(e.target.value)}
                required
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="hs-dur">슬롯 길이(분)</label>
              <input
                id="hs-dur"
                type="number"
                min={1}
                value={slotDurationMins}
                onChange={(e) => setSlotDurationMins(Number(e.target.value))}
                required
              />
            </div>
            <div className="page-shell__field">
              <label htmlFor="hs-appr">승인 방식</label>
              <select
                id="hs-appr"
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
              <label htmlFor="hs-cat">노출 카테고리 (선택)</label>
              <select
                id="hs-cat"
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
              <label htmlFor="hs-listed">
                <input
                  id="hs-listed"
                  type="checkbox"
                  checked={isListed}
                  onChange={(e) => setIsListed(e.target.checked)}
                />{' '}
                완료 후 마켓플레이스에 공개할 예정 (비공개면 직접 링크만)
              </label>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
