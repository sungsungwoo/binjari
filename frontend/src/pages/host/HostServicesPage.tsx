import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDelete, apiGetJson } from '../../lib/api'
import { BookingPageCoverHero, resolveBookingCoverUrl } from './BookingPageCoverHero'
import '../page-shell.css'
import './host-services.css'

type Metrics = {
  rules_count: number
  open_slots_count: number
  today_bookings: number
  week_bookings: number
  pending_bookings: number
}

type HostSetting = {
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
  updated_at: string
  /** 예약 페이지 커버(썸네일) URL — 백엔드에 필드가 생기면 여기로 내려주면 됩니다. */
  cover_image_url?: string | null
}

type ListRes = { success: true; data: { items: (HostSetting & { metrics: Metrics })[] } }

const PAGE_SIZE = 9

type StatusFilter = '' | 'draft' | 'active' | 'inactive'
type ListedFilter = '' | 'listed' | 'unlisted'
type ApprovalFilter = '' | 'AUTO' | 'MANUAL'

export function HostServicesPage() {
  const [items, setItems] = useState<ListRes['data']['items'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [listedFilter, setListedFilter] = useState<ListedFilter>('')
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGetJson<ListRes>('/api/v1/host/booking-pages')
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
  }, [])

  useEffect(() => {
    setPage(1)
  }, [searchQ, statusFilter, listedFilter, approvalFilter, categoryFilter])

  const filtered = useMemo(() => {
    if (!items) return []
    const q = searchQ.trim().toLowerCase()
    return items.filter((h) => {
      if (q && !h.title.toLowerCase().includes(q) && !h.slug.toLowerCase().includes(q)) {
        return false
      }
      if (statusFilter === 'draft' && h.setup_completed) return false
      if (statusFilter === 'active' && (!h.is_active || !h.setup_completed)) return false
      if (statusFilter === 'inactive' && (h.is_active || !h.setup_completed)) return false
      if (listedFilter === 'listed' && !h.is_listed) return false
      if (listedFilter === 'unlisted' && h.is_listed) return false
      if (approvalFilter && h.approval_type !== approvalFilter) return false
      if (categoryFilter) {
        const cat = h.listing_category ?? ''
        if (categoryFilter === '__none__' && cat) return false
        if (categoryFilter !== '__none__' && cat !== categoryFilter) return false
      }
      return true
    })
  }, [
    items,
    searchQ,
    statusFilter,
    listedFilter,
    approvalFilter,
    categoryFilter,
  ])

  async function deleteBookingPage(h: HostSetting & { metrics: Metrics }) {
    const msg =
      `「${h.title}」예약 페이지를 삭제할까요?\n\n` +
      '이 페이지에 연결된 예약·슬롯·운영 규칙·예외 일정이 데이터베이스에서 모두 삭제되며, 되돌릴 수 없습니다.'
    if (!window.confirm(msg)) return
    setDeletingId(h.id)
    setError(null)
    try {
      await apiDelete(`/api/v1/host/booking-pages/${h.id}`)
      setItems((prev) => prev?.filter((x) => x.id !== h.id) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const slice = filtered.slice(
    (pageClamped - 1) * PAGE_SIZE,
    pageClamped * PAGE_SIZE,
  )

  return (
    <div className="page-shell hs-page">
      <div className="hs-page__header">
        <div>
          <h1 className="page-shell__title">예약 페이지 목록</h1>
          <p className="page-shell__lead" style={{ marginBottom: 0 }}>
            어떤 예약 페이지인지 빠르게 구분하고, 바로 대시보드나 편집으로 이동할 수 있게
            구성했습니다.
          </p>
        </div>
        <div className="hs-page__toolbar">
          <Link className="page-shell__btn" to="/host/services/new">
            + 새 예약 페이지 만들기
          </Link>
        </div>
      </div>

      <div className="hs-filters">
        <input
          type="search"
          className="hs-page__search hs-page__search--bar"
          placeholder="예약 페이지 이름으로 검색"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          aria-label="검색"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="상태"
        >
          <option value="">전체 상태</option>
          <option value="draft">초안</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>
        <select
          value={listedFilter}
          onChange={(e) => setListedFilter(e.target.value as ListedFilter)}
          aria-label="공개"
        >
          <option value="">공개 범위</option>
          <option value="listed">마켓 공개</option>
          <option value="unlisted">마켓 비공개</option>
        </select>
        <span className="page-shell__muted hs-filters__sort-pill" aria-hidden>
          최신순
        </span>
        <div className="hs-filters__extra">
          <select
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value as ApprovalFilter)}
            aria-label="승인"
          >
            <option value="">승인 방식</option>
            <option value="AUTO">자동 승인</option>
            <option value="MANUAL">수동 승인</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="카테고리"
          >
            <option value="">전체 카테고리</option>
            <option value="__none__">미분류</option>
            <option value="과외">과외</option>
            <option value="상담">상담</option>
            <option value="인터뷰">인터뷰</option>
            <option value="시설">시설</option>
            <option value="기타">기타</option>
          </select>
          <span className="page-shell__muted hs-filters__sort-hint">
            정렬: 최근 수정순
          </span>
        </div>
      </div>

      {error ? <div className="page-shell__error">{error}</div> : null}

      {items?.length === 0 ? (
        <div className="hs-empty">
          <h2 className="page-shell__title" style={{ fontSize: '1.15rem' }}>
            예약 페이지가 아직 없어요
          </h2>
          <p className="page-shell__muted">
            첫 예약 페이지를 만들고 예약을 받아보세요.
          </p>
        </div>
      ) : null}

      {items && items.length > 0 && filtered.length === 0 ? (
        <p className="page-shell__muted">필터에 맞는 페이지가 없습니다.</p>
      ) : null}

      <div className="hs-cards">
        {slice.map((h) => {
          const draft = !h.setup_completed
          const slugOk = Boolean(h.slug?.trim())
          const publicUrl = `/book/${h.slug}`
          const statusLabel = draft ? '초안' : h.is_active ? '활성' : '비활성'
          const visibilityLabel = draft
            ? '설정 필요'
            : h.is_listed
              ? '공개중'
              : '비공개'
          const desc =
            h.description?.trim() ||
            (draft
              ? '운영 규칙과 슬롯 설정이 아직 완료되지 않았어요.'
              : h.is_active
                ? '예약을 받을 수 있는 페이지입니다.'
                : '아직 공개되지 않은 예약 페이지입니다.')
          const coverSrc = resolveBookingCoverUrl(h)

          return (
            <article key={h.id} className="hs-card">
              <div className="hs-card__hero">
                <BookingPageCoverHero seed={h.id + h.slug} imageUrl={coverSrc} />
                <div className="hs-card__hero-overlay" aria-hidden />
                <div className="hs-card__badges" aria-label="상태">
                  <span
                    className={
                      draft
                        ? 'hs-pill hs-pill--draft'
                        : h.is_active
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
                        : h.is_listed
                          ? 'hs-pill hs-pill--listed'
                          : 'hs-pill hs-pill--unlisted'
                    }
                  >
                    {visibilityLabel}
                  </span>
                </div>
                <div className="hs-card__hero-text">
                  <h2 className="hs-card__hero-title">{h.title}</h2>
                  <p className="hs-card__hero-desc">{desc}</p>
                </div>
              </div>
              <div className="hs-card__footer">
                <div className="hs-card__footer-main">
                  {slugOk ? (
                    <div className="hs-card__footer-url">
                      <p className="hs-card__footer-url-label">공개 URL</p>
                      <p className="hs-card__footer-url-value" title={publicUrl}>
                        {publicUrl}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="hs-card__footer-actions">
                  <Link
                    className="hs-card__chip"
                    to={`/host/services/${h.slug}/dashboard`}
                  >
                    대시보드
                  </Link>
                  <Link className="hs-card__chip hs-card__chip--soft" to={`/host/services/${h.id}/edit`}>
                    편집
                  </Link>
                  <button
                    type="button"
                    className="hs-card__chip hs-card__chip--danger"
                    disabled={deletingId === h.id}
                    onClick={() => void deleteBookingPage(h)}
                  >
                    {deletingId === h.id ? '삭제 중…' : '삭제'}
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {filtered.length > PAGE_SIZE ? (
        <div className="hs-pagination">
          <button
            type="button"
            className="page-shell__btn page-shell__btn--ghost"
            disabled={pageClamped <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            이전
          </button>
          <span className="page-shell__muted">
            {pageClamped} / {totalPages}
          </span>
          <button
            type="button"
            className="page-shell__btn page-shell__btn--ghost"
            disabled={pageClamped >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            다음
          </button>
        </div>
      ) : null}
    </div>
  )
}
