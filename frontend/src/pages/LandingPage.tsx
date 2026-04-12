import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Info,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiGetJson } from '../lib/api'
import { BookingPageCoverHero, resolveBookingCoverUrl } from './host/BookingPageCoverHero'
import './LandingPage.css'
import './host/host-services.css'

/** 백엔드 `MARKETPLACE_UNCATEGORIZED_CATEGORY` 와 동일 */
const MARKETPLACE_UNCATEGORIZED = '__uncategorized__'

type FlowMode = 'host' | 'booker'

type MarketplaceItem = {
  slug: string
  title: string
  description: string | null
  listing_category: string | null
}

type MarketplaceRes = {
  success: true
  data: { items: MarketplaceItem[]; next_cursor: string | null }
}

function marketplaceUrl(q: string, cat: string) {
  const p = new URLSearchParams()
  p.set('limit', '24')
  const qt = q.trim()
  if (qt) p.set('q', qt)
  if (cat === MARKETPLACE_UNCATEGORIZED) p.set('category', cat)
  else if (cat) p.set('category', cat)
  return `/api/v1/public/marketplace/booking-pages?${p.toString()}`
}

/** 2026년 4월 달력 그리드(일 시작) — 히어로 목업용 정적 데이터 */
function buildHeroMockCalendarCells() {
  const start = new Date(2026, 2, 29)
  const cells: Array<{
    key: string
    day: number
    inMonth: boolean
    selected: boolean
    openCount: number | null
  }> = []
  const withOpen = new Set([
    12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30,
  ])
  const counts: Record<number, number> = {
    12: 4,
    13: 4,
    14: 5,
    15: 5,
    16: 4,
    17: 3,
    19: 5,
    20: 4,
    21: 5,
    22: 4,
    23: 5,
    24: 4,
    26: 3,
    27: 4,
    28: 5,
    29: 4,
    30: 3,
  }
  for (let i = 0; i < 42; i += 1) {
    const dt = new Date(start)
    dt.setDate(start.getDate() + i)
    const inMonth = dt.getMonth() === 3
    const dom = dt.getDate()
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`
    const selected = inMonth && dom === 13
    let openCount: number | null = null
    if (inMonth && withOpen.has(dom)) {
      openCount = counts[dom] ?? 4
    }
    cells.push({ key, day: dom, inMonth, selected, openCount })
  }
  return cells
}

const HERO_MOCK_CAL_CELLS = buildHeroMockCalendarCells()

function LandingHeroBookingMockup() {
  return (
    <div
      className="landing-hero-mock pointer-events-none select-none"
      role="img"
      aria-label="공개 예약 페이지 레이아웃 목업: 캘린더와 시간 목록"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-300/90 bg-slate-100 shadow-lg shadow-slate-400/25 ring-1 ring-slate-300/60">
        <div className="border-b border-slate-200 bg-gradient-to-br from-slate-100 via-white to-slate-100 p-3 md:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-sm font-semibold text-slate-900 md:text-base">
                  예약 페이지 미리보기
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium text-[color:var(--binjari-primary-hover)] ring-1 ring-[color:var(--binjari-primary-border)]">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  캘린더 중심 예약
                </span>
              </div>
              <p className="mt-1 max-w-[18rem] text-[11px] leading-snug text-slate-600 md:text-xs">
                월간 캘린더에서 날짜를 고르고, 오른쪽에서 시간을 비교합니다.
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
              <div className="text-[10px] font-medium text-slate-500">가장 빠른 예약</div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-900">
                4월 13일 · 10:20
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
              <CheckCircle2 className="h-3 w-3 text-slate-500" aria-hidden />
              호스트 승인 후 확정
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
              <Globe2 className="h-3 w-3 text-slate-500" aria-hidden />
              Asia/Seoul 기준
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
              <Clock3 className="h-3 w-3 text-slate-500" aria-hidden />
              슬롯 80분
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
              <CalendarDays className="h-3 w-3 text-slate-500" aria-hidden />
              이번 달 14일 가능
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-xl bg-[var(--binjari-primary)] px-3 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-slate-400/30">
              내 예약 보기
            </span>
            <span className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm">
              공개 페이지 공유
            </span>
          </div>
        </div>

        <div className="grid border-slate-200 md:grid-cols-[1fr_minmax(0,11.5rem)] lg:grid-cols-[1fr_minmax(0,12.5rem)]">
          <div className="border-b border-slate-200 md:border-b-0 md:border-r md:border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2 md:px-4">
              <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">
                <ChevronLeft className="h-3 w-3" aria-hidden />
                이전
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-200/90 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
                <CalendarDays className="h-3.5 w-3.5 text-slate-600" aria-hidden />
                2026년 4월
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">
                다음
                <ChevronRight className="h-3 w-3" aria-hidden />
              </span>
            </div>
            <div className="bg-slate-50 px-2 pb-3 pt-2 md:px-3">
              <div className="grid grid-cols-7 gap-0.5 pb-1 text-center text-[9px] font-medium text-slate-500">
                {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                  <div key={d} className="py-0.5 text-slate-500">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {HERO_MOCK_CAL_CELLS.map((c) => (
                  <div
                    key={c.key}
                    className={[
                      'landing-hero-mock__day relative flex min-h-[2.35rem] flex-col items-center justify-between rounded-lg border p-0.5',
                      !c.inMonth
                        ? 'border-transparent bg-slate-200/60 text-slate-400'
                        : c.selected
                          ? 'border-[var(--binjari-primary)] bg-[var(--binjari-primary)] text-white shadow-[var(--binjari-shadow-primary-soft)]'
                          : 'border-slate-200 bg-white text-slate-900 shadow-sm',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'text-[10px] font-semibold tabular-nums',
                        c.inMonth && !c.selected ? 'text-slate-800' : '',
                        c.inMonth && c.selected ? 'text-white' : '',
                        !c.inMonth ? 'text-slate-400' : '',
                      ].join(' ')}
                    >
                      {c.day}
                    </span>
                    {c.inMonth && c.openCount != null ? (
                      <span
                        className={[
                          'inline-flex items-center gap-0.5 text-[8px] font-bold tabular-nums',
                          c.selected ? 'text-white' : 'text-[color:var(--binjari-primary)]',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            c.selected ? 'bg-white/90' : 'binjari-ui-dot-open',
                          ].join(' ')}
                          aria-hidden
                        />
                        {c.openCount}
                      </span>
                    ) : (
                      <span className="h-2.5" aria-hidden />
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 border-t border-slate-200 px-0.5 pt-2 text-[9px] leading-relaxed text-slate-500">
                숫자는 예약 가능 슬롯 개수입니다.
              </p>
            </div>
          </div>

          <aside className="border-t border-slate-200 bg-slate-100/90 p-3 md:border-t-0 md:border-l md:border-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-medium text-slate-500">선택한 날짜</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">4월 13일</div>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--binjari-primary-subtle)] px-2 py-0.5 text-[9px] font-semibold text-[color:var(--binjari-primary-hover)] ring-1 ring-[color:var(--binjari-primary-border)]">
                오늘
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-[10px] text-slate-600 shadow-sm">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <p className="leading-snug">열린 시간만 표시됩니다.</p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-800">예약 가능한 시간</span>
              <span className="rounded-full bg-[var(--binjari-primary-subtle)] px-2 py-0.5 text-[9px] font-medium text-[color:var(--binjari-primary-hover)]">
                4개 가능
              </span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {['10:20', '13:00', '14:20', '15:40'].map((t, i) => (
                <li
                  key={t}
                  className={[
                    'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px]',
                    i === 0
                      ? 'border-slate-800 bg-slate-800 text-white shadow-md shadow-slate-400/40'
                      : 'border-slate-200 bg-white text-slate-800 shadow-sm',
                  ].join(' ')}
                >
                  <span className="w-9 shrink-0 font-semibold tabular-nums">{t}</span>
                  <span
                    className={[
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      i === 0 ? 'bg-white/80' : 'binjari-ui-dot-open',
                    ].join(' ')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    비어 있음 · 예약 가능
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="text-[10px] font-medium text-slate-500">현재 선택</div>
              <div className="mt-1 text-[11px] font-semibold text-slate-900">
                시간을 선택해 주세요
              </div>
              <div className="mt-2 h-7 rounded-lg border border-slate-200 bg-slate-100 text-center text-[10px] font-semibold leading-7 text-slate-400">
                예약 확인으로 이동
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  const { accessToken, userEmail, isHost } = useAuth()
  const loggedIn = Boolean(accessToken)
  const [flowMode, setFlowMode] = useState<FlowMode>('host')
  const [exploreQ, setExploreQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [exploreCat, setExploreCat] = useState<string>('')
  const [exploreItems, setExploreItems] = useState<MarketplaceItem[] | null>(
    null,
  )
  const [exploreLoading, setExploreLoading] = useState(false)
  const [exploreError, setExploreError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(exploreQ), 320)
    return () => window.clearTimeout(t)
  }, [exploreQ])

  useEffect(() => {
    let cancelled = false
    setExploreLoading(true)
    setExploreError(null)
    ;(async () => {
      try {
        const res = await apiGetJson<MarketplaceRes>(
          marketplaceUrl(debouncedQ, exploreCat),
          { auth: false },
        )
        if (!cancelled) setExploreItems(res.data.items)
      } catch (e) {
        if (!cancelled) {
          setExploreItems(null)
          setExploreError(
            e instanceof Error ? e.message : '목록을 불러오지 못했습니다.',
          )
        }
      } finally {
        if (!cancelled) setExploreLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedQ, exploreCat])

  const createPageHref = isHost ? '/host/services/new' : '/auth/signup'
  const displayName = userEmail?.split('@')[0] ?? ''

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Hero */}
      <section className="px-5 pb-8 pt-6 md:px-8 md:pb-10 md:pt-8" id="landing-intro">
        <div className="mx-auto max-w-7xl">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_54%,#eff6ff_100%)] p-5 md:p-6 lg:p-7">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:items-center xl:gap-7">
                <div>
                  {loggedIn && displayName ? (
                    <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-[color:var(--binjari-primary-hover)] ring-1 ring-[color:var(--binjari-primary-border)]">
                      <UserRound className="h-3.5 w-3.5" aria-hidden />
                      안녕하세요, {displayName}님
                    </p>
                  ) : (
                    <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-[color:var(--binjari-primary-hover)] ring-1 ring-[color:var(--binjari-primary-border)]">
                      <UserRound className="h-3.5 w-3.5" aria-hidden />
                      링크 하나로 시작하는 예약 경험
                    </p>
                  )}
                  <h1 className="text-[2.15rem] font-semibold tracking-tight text-slate-900 md:text-[2.8rem] md:leading-[1.12]">
                    복잡한 일정 조율,
                    <br />
                    <span className="text-[var(--binjari-primary)]">링크 하나</span>
                    로 끝내세요
                  </h1>
                  <p className="mt-3 max-w-2xl text-[1.02rem] leading-7 text-slate-600 md:text-lg md:leading-8">
                    Binjari는 슬롯 기반 예약 페이지를 만들고 공유할 수 있는 예약
                    플랫폼입니다. 호스트는 운영 규칙과 승인 방식을 손쉽게 관리하고,
                    예약자는 캘린더에서 가능한 시간만 골라 빠르게 예약할 수 있습니다.
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 md:text-[15px] md:leading-7">
                    상담, 인터뷰, 과외, 공간 대여처럼 일정 조율이 반복되는 상황을 더
                    단순하게 만듭니다. 중복 예약은 서버에서 막고, 공개 페이지는 누구나
                    열어볼 수 있어 공유도 쉽습니다.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      className="binjari-btn-solid inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[0.97rem] font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
                      to={createPageHref}
                    >
                      내 예약 페이지 만들기
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <a
                      className="text-sm font-semibold text-[color:var(--binjari-primary-hover)] underline-offset-4 hover:underline"
                      href="#landing-explore"
                    >
                      공개 예약 페이지 둘러보기
                    </a>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3 sm:gap-3">
                    {[
                      {
                        icon: Link2,
                        title: '공유는 더 간단하게',
                        body: '앱 설치 없이 URL만 전달하면 바로 예약 페이지를 열 수 있습니다.',
                      },
                      {
                        icon: ShieldCheck,
                        title: '중복 예약은 더 안전하게',
                        body: '선점과 제약 조건으로 같은 시간에 두 명이 확정되지 않도록 관리합니다.',
                      },
                      {
                        icon: Clock3,
                        title: '시간 선택은 더 빠르게',
                        body: '열린 시간만 보여줘 예약자는 고민 없이 가능한 슬롯만 고를 수 있습니다.',
                      },
                    ].map(({ icon: Icon, title, body }) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm"
                      >
                        <div className="inline-flex rounded-xl bg-slate-50 p-2 text-slate-700">
                          <Icon className="h-4 w-4" aria-hidden />
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">
                          {title}
                        </h3>
                        <p className="mt-1 text-[13px] leading-[1.45] text-slate-500">
                          {body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
                  <div className="border-b border-slate-100 bg-white/95 px-4 py-2.5 md:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                          Public Booking Preview
                        </p>
                        <p className="mt-0.5 text-base font-semibold text-slate-900">
                          실제 공개 예약 페이지 레이아웃
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--binjari-primary-subtle)] px-3 py-1 text-[11px] font-semibold text-[color:var(--binjari-primary-hover)]">
                        Calendar + Time List
                      </span>
                    </div>
                  </div>
                  <div className="rounded-b-[20px] bg-slate-200/40 p-2 ring-1 ring-slate-300/40 md:p-3">
                    <LandingHeroBookingMockup />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value */}
      <section className="px-5 py-9 md:px-8" id="landing-value">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">
            핵심 가치
          </h2>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[15px] leading-6 text-slate-600 md:leading-7">
            예약을 받는 사람과 예약하는 사람 모두에게 익숙하고 단순한 흐름을
            제공합니다. 처음 쓰는 사용자도 설명을 오래 읽지 않고 바로 이해할 수
            있도록 구성합니다.
          </p>
          <ul className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
            {[
              {
                title: '링크 하나로 공유',
                body: '별도 앱 설치 없이 링크만 전달하면 됩니다. 메시지, 메일, 커뮤니티 어디에서든 같은 예약 페이지를 열 수 있습니다.',
                icon: Link2,
              },
              {
                title: '중복 예약 방지',
                body: '선점과 서버 제약을 함께 사용해 같은 시간대에 중복 확정이 생기지 않도록 설계했습니다.',
                icon: CheckCircle2,
              },
              {
                title: '캘린더로 한눈에',
                body: '호스트 타임존 기준으로 열린 날짜와 시간을 보여줘 예약자는 가능한 슬롯만 보고 빠르게 선택할 수 있습니다.',
                icon: CalendarDays,
              },
            ].map(({ title, body, icon: Icon }) => (
              <li
                key={title}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[color:var(--binjari-primary-border)] hover:shadow-md"
              >
                <div className="inline-flex rounded-2xl bg-slate-50 p-2.5 text-slate-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-3 text-[1.08rem] font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="mt-1.5 text-[14px] leading-6 text-slate-600 md:leading-7">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Flow */}
      <section
        className="border-y border-slate-200/80 bg-white px-5 py-9 md:px-8"
        id="landing-flow"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">
            사용자 유형별 흐름
          </h2>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[15px] leading-6 text-slate-600 md:leading-7">
            호스트는 운영과 관리에 집중하고, 예약자는 선택과 확인에 집중할 수 있도록
            흐름을 나눴습니다. 관점을 바꿔 보면서 각 사용자가 무엇을 먼저 보게
            되는지 확인할 수 있습니다.
          </p>

          <div
            className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1"
            role="tablist"
            aria-label="흐름 선택"
          >
            <button
              type="button"
              role="tab"
              aria-selected={flowMode === 'host'}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                flowMode === 'host'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setFlowMode('host')}
            >
              호스트
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={flowMode === 'booker'}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                flowMode === 'booker'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setFlowMode('booker')}
            >
              예약자
            </button>
          </div>

          {flowMode === 'host' ? (
            <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_minmax(0,19rem)] lg:items-start lg:gap-5">
              <ol className="space-y-3">
                {[
                  {
                    step: '1',
                    title: '계정·페이지 만들기',
                    text: '회원가입 후 예약 페이지를 만들고 제목, 설명, 타임존처럼 공개 페이지에 필요한 기본 정보를 정합니다.',
                    icon: Sparkles,
                  },
                  {
                    step: '2',
                    title: '규칙·슬롯·공개 설정',
                    text: '운영 규칙과 예약 가능한 시간을 세팅한 뒤 공개하면, 누구나 공유 링크로 일정 조율을 시작할 수 있습니다.',
                    icon: CalendarDays,
                  },
                  {
                    step: '3',
                    title: '예약 받기·관리',
                    text: '대시보드에서 일정과 승인 대기 예약을 확인하고, 필요할 때 승인·거절·수정으로 운영을 이어갑니다.',
                    icon: LayoutDashboard,
                  },
                ].map((row) => {
                  const Icon = row.icon
                  return (
                  <li
                    key={row.step}
                    className="flex gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 md:p-5"
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--binjari-primary)] text-sm font-bold text-white"
                      aria-hidden
                    >
                      {row.step}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="h-4 w-4 text-slate-500" aria-hidden />
                        <h3 className="text-[1.02rem] font-semibold text-slate-900">
                          {row.title}
                        </h3>
                      </div>
                      <p className="mt-1.5 text-[14px] leading-6 text-slate-600 md:leading-7">
                        {row.text}
                      </p>
                    </div>
                  </li>
                  )
                })}
              </ol>
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 md:p-5 md:leading-7">
                <p className="font-semibold text-slate-800">호스트 팁</p>
                <p className="mt-1.5">
                  공개 페이지에서는 제목과 설명이 곧 신뢰 요소가 됩니다. 어떤
                  예약인지, 얼마나 걸리는지, 승인 방식이 무엇인지를 초반에 분명히
                  적어 두면 전환율이 좋아집니다. 마켓플레이스에 공개하면 다른
                  사용자가 목록에서 페이지를 찾을 수 있습니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_minmax(0,19rem)] lg:items-start lg:gap-5">
              <ol className="space-y-3">
                {[
                  {
                    step: '1',
                    title: '링크로 예약 페이지 열기',
                    text: '호스트가 공유한 링크로 들어가 예약 목적, 진행 시간, 타임존, 승인 방식을 먼저 확인합니다.',
                    icon: Link2,
                  },
                  {
                    step: '2',
                    title: '날짜·시간 선택 후 예약',
                    text: '캘린더에서 열린 날짜를 고르고, 가능한 시간만 선택합니다. 로그인 뒤 예약 요청 또는 즉시 확정이 진행됩니다.',
                    icon: CalendarDays,
                  },
                  {
                    step: '3',
                    title: '내 예약에서 상태 확인',
                    text: '승인 대기, 확정, 취소 상태를 한곳에서 확인하고, 필요한 경우 세부 내용을 다시 열어볼 수 있습니다.',
                    icon: Ticket,
                  },
                ].map((row) => {
                  const Icon = row.icon
                  return (
                    <li
                      key={row.step}
                      className="flex gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 md:p-5"
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--binjari-primary)] text-sm font-bold text-white"
                        aria-hidden
                      >
                        {row.step}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Icon className="h-4 w-4 text-slate-500" aria-hidden />
                          <h3 className="text-[1.02rem] font-semibold text-slate-900">
                            {row.title}
                          </h3>
                        </div>
                        <p className="mt-1.5 text-[14px] leading-6 text-slate-600 md:leading-7">
                          {row.text}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 md:p-5 md:leading-7">
                <p className="font-semibold text-slate-800">예약자 팁</p>
                <p className="mt-1.5">
                  공개 예약 페이지는 로그인 전에도 열어볼 수 있어, 먼저 가능한
                  날짜와 설명을 확인한 뒤 마지막 단계에서만 로그인하도록 흐름을
                  단순하게 유지할 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Marketplace — same API & card pattern as app */}
      <section className="px-5 py-9 md:px-8" id="landing-explore">
        <div className="mx-auto max-w-[100rem]">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900 md:text-[2rem]">
            공개 예약 페이지
          </h2>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[15px] leading-6 text-slate-600 md:leading-7">
            마켓플레이스에 공개된 예약 페이지를 둘러보며 서비스 분위기와 사용
            사례를 확인할 수 있습니다. 검색과 카테고리 필터로 원하는 유형의 예약
            흐름을 탐색합니다(목록은 공개 설정된 페이지만 표시).
          </p>

          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap gap-3">
            <input
              type="search"
              className="min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 placeholder:text-slate-400 focus:ring-2"
              placeholder="제목·설명 검색"
              value={exploreQ}
              onChange={(e) => setExploreQ(e.target.value)}
              aria-label="예약 페이지 검색"
            />
            <select
              className="min-w-[10rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-slate-200"
              value={exploreCat}
              onChange={(e) => setExploreCat(e.target.value)}
              aria-label="카테고리"
            >
              <option value="">전체 카테고리</option>
              <option value="과외">과외</option>
              <option value="상담">상담</option>
              <option value="인터뷰">인터뷰</option>
              <option value="시설">시설</option>
              <option value="기타">기타</option>
              <option value={MARKETPLACE_UNCATEGORIZED}>미분류</option>
            </select>
          </div>

          {exploreError ? (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">
              {exploreError}
            </p>
          ) : null}
          {exploreLoading ? (
            <p className="mt-4 text-center text-sm text-slate-500">
              불러오는 중…
            </p>
          ) : null}

          <div className="mt-5 hs-cards landing-explore__cards">
            {(exploreItems ?? []).map((c) => {
              const catLabel = c.listing_category?.trim() || '미분류'
              const desc =
                c.description?.trim() || '설명이 등록되지 않았습니다.'
              const publicUrl = `/book/${c.slug}`
              const coverSrc = resolveBookingCoverUrl({
                id: c.slug,
                slug: c.slug,
              })
              return (
                <article key={c.slug} className="hs-card">
                  <div className="hs-card__hero">
                    <BookingPageCoverHero
                      seed={c.slug}
                      imageUrl={coverSrc}
                    />
                    <div className="hs-card__hero-overlay" aria-hidden />
                    <div className="hs-card__badges" aria-label="카테고리">
                      <span className="hs-pill hs-pill--listed">{catLabel}</span>
                    </div>
                    <div className="hs-card__hero-text">
                      <h2 className="hs-card__hero-title">{c.title}</h2>
                      <p className="hs-card__hero-desc">{desc}</p>
                    </div>
                  </div>
                  <div className="hs-card__footer">
                    <div className="hs-card__footer-main">
                      <div className="hs-card__footer-url">
                        <p className="hs-card__footer-url-label">공개 URL</p>
                        <p className="hs-card__footer-url-value" title={publicUrl}>
                          {publicUrl}
                        </p>
                      </div>
                    </div>
                    <div className="hs-card__footer-actions">
                      <Link
                        className="binjari-btn-solid w-full justify-center rounded-full py-2 text-[0.6875rem] font-semibold text-white"
                        to={publicUrl}
                      >
                        예약 페이지 열기
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {!exploreLoading && !exploreError && (exploreItems?.length ?? 0) === 0 ? (
            <p className="mt-5 text-center text-sm text-slate-500">
              표시할 공개 페이지가 없습니다.
            </p>
          ) : null}
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-slate-200 bg-slate-50 px-5 py-9 md:px-8" id="landing-trust">
        <div className="mx-auto max-w-7xl">
          <h2 className="text-center text-2xl font-semibold text-slate-900 md:text-[2rem]">
            신뢰 및 운영
          </h2>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[15px] leading-6 text-slate-600 md:leading-7">
            예약은 보기 좋은 화면만으로 끝나지 않습니다. 실제 운영에서 필요한
            시간대, 승인 방식, 변경 알림까지 고려해 호스트가 안심하고 사용할 수
            있는 기반을 준비합니다.
          </p>
          <ul className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
            {[
              {
                title: '시간대(Timezone)',
                body: '호스트 타임존 기준으로 규칙과 마감을 계산하고, 데이터 저장은 UTC로 맞춰 일관성을 유지합니다.',
                icon: Globe2,
              },
              {
                title: '승인 정책',
                body: '자동 확정과 수동 승인을 페이지마다 선택할 수 있어 예약 성격에 맞는 운영이 가능합니다.',
                icon: CheckCircle2,
              },
              {
                title: '알림',
                body: '예약과 슬롯 변경 정보를 연결할 수 있도록 후속 확장이 쉬운 구조를 고려하고 있습니다.',
                icon: Ticket,
              },
            ].map((x) => {
              const Icon = x.icon
              return (
                <li
                  key={x.title}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="inline-flex rounded-2xl bg-slate-50 p-2.5 text-slate-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-3 text-[1.02rem] font-semibold text-slate-900">
                    {x.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-6 text-slate-600 md:leading-7">
                    {x.body}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-5 py-8 md:px-8" id="landing-pricing">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold text-slate-900">요금제</h2>
          <p className="mt-2 text-[15px] leading-6 text-slate-600 md:leading-7">
            현재는 포트폴리오·MVP 단계로, 요금보다 제품 경험을 먼저 다듬는 데
            집중하고 있습니다. 핵심 흐름을 충분히 검증한 뒤 정식 요금제를 공개할
            예정입니다.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[var(--binjari-primary,#006bff)] px-5 py-10 text-white md:px-8 md:py-12">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold leading-snug md:text-[2rem]">
            지금 바로 나만의 예약 흐름을 만들어 보세요.
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/85 md:text-[15px] md:leading-7">
            상담, 과외, 인터뷰, 공간 대여까지. 복잡한 일정 조율을 더 단순하고
            신뢰감 있게 바꿔 보세요.
          </p>
          <Link
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg ring-2 ring-white/35"
            to={createPageHref}
          >
            예약 페이지 만들기
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Legal */}
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-6 md:px-8" id="terms" tabIndex={-1}>
        <div className="mx-auto max-w-7xl">
          <h3 className="text-sm font-semibold text-slate-800">이용약관</h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600 md:leading-7">
            정식 서비스 오픈 시 게시됩니다. 현재는 제품 방향과 예약 경험을 검증하는
            데모 단계입니다.
          </p>
        </div>
      </div>
      <div className="bg-slate-50 px-5 py-6 md:px-8" id="privacy" tabIndex={-1}>
        <div className="mx-auto max-w-7xl">
          <h3 className="text-sm font-semibold text-slate-800">
            개인정보처리방침
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600 md:leading-7">
            정식 서비스 오픈 시 게시됩니다. 현재 데모 환경에서는 최소한의 테스트용
            정보만 가정하고 있습니다.
          </p>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-6 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            Binjari
          </Link>
          <nav className="flex flex-wrap justify-center gap-4 text-sm" aria-label="법적 정보">
            <a href="#terms" className="text-slate-600 hover:text-slate-900">
              이용약관
            </a>
            <a href="#privacy" className="text-slate-600 hover:text-slate-900">
              개인정보처리방침
            </a>
            <a
              href="#landing-explore"
              className="text-slate-600 hover:text-slate-900"
            >
              공개 페이지
            </a>
            <a
              href="mailto:hello@binjari.com"
              className="text-slate-600 hover:text-slate-900"
            >
              문의
            </a>
          </nav>
        </div>
        <p className="mx-auto mt-4 max-w-7xl text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Binjari — 남는 시간을 연결하는 예약 플랫폼
        </p>
      </footer>
    </div>
  )
}
