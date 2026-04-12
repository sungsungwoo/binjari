import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { apiGetJson } from '../../lib/api'
import { coverGradient } from './BookingPageCoverHero'
import type {
  HostServiceEditOutletContext,
  LiveBasicPreview,
} from './hostEditContext'
import '../page-shell.css'
import './host-services.css'
import './host-edit-layout.css'
import './host-service-setup.css'

const nav = [
  { to: 'basic', label: '기본 정보' },
  { to: 'rules', label: '운영 규칙' },
  { to: 'slots', label: '슬롯 생성' },
  { to: 'overrides', label: '예외 일정' },
] as const

type PreviewRes = {
  success: true
  data: {
    slug: string
    title: string
    description: string | null
    is_listed: boolean
  }
}

export function HostServiceEditLayout() {
  const { hostSettingId } = useParams<{ hostSettingId: string }>()
  const base = `/host/services/${hostSettingId}/edit`
  const [preview, setPreview] = useState<PreviewRes['data'] | null>(null)
  const [liveBasic, setLiveBasic] = useState<LiveBasicPreview | null>(null)

  useEffect(() => {
    if (!hostSettingId) return
    let c = false
    ;(async () => {
      try {
        const res = await apiGetJson<PreviewRes>(
          `/api/v1/host/booking-pages/${hostSettingId}`,
        )
        if (!c) setPreview(res.data)
      } catch {
        if (!c) setPreview(null)
      }
    })()
    return () => {
      c = true
    }
  }, [hostSettingId])

  const slugForPreview =
    liveBasic?.slug?.trim() || preview?.slug?.trim() || ''
  const publicUrl = `/book/${slugForPreview || '…'}`
  const previewTitle =
    (liveBasic?.title ?? preview?.title)?.trim() || '예약 페이지 제목'
  const previewDescription =
    (liveBasic?.description ?? preview?.description ?? '')?.trim() ||
    '운영 규칙과 슬롯 설정이 아직 완료되지 않았어요.'
  const previewListed = liveBasic?.is_listed ?? preview?.is_listed ?? true
  const heroGradient = useMemo(
    () => coverGradient((slugForPreview.toLowerCase() || 'edit') + '-preview'),
    [slugForPreview],
  )

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
              기본 정보·운영 규칙·슬롯·예외 일정을 단계별로 편집할 수 있어요. 저장된
              설정은 예약 페이지에 바로 반영됩니다.
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

          <div className="host-edit-layout__sidebar-card">
            <section
              className="host-service-new__sidebar-actions host-edit-layout__sidebar-nav-section"
              aria-label="편집 단계"
            >
              <p className="host-service-new__sidebar-actions-label">편집 단계</p>
              <nav>
                <ul className="host-edit-layout__nav">
                  {nav.map(({ to, label }) => (
                    <li key={to}>
                      <NavLink
                        to={`${base}/${to}`}
                        className={({ isActive }) =>
                          isActive
                            ? 'host-edit-layout__nav-link host-edit-layout__nav-link--active'
                            : 'host-edit-layout__nav-link'
                        }
                        end={to === 'basic'}
                      >
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </section>
          </div>
        </div>
      </aside>
      <main className="host-edit-layout__main">
        <Outlet
          context={
            {
              embedded: true,
              setLiveBasicPreview: setLiveBasic,
            } satisfies HostServiceEditOutletContext
          }
        />
      </main>
    </div>
  )
}
