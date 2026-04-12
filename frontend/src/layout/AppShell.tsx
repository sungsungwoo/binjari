import { Armchair } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import './AppShell.css'

export function AppShell() {
  const { accessToken, signOut, isHost, isAdmin } = useAuth()
  const loggedIn = Boolean(accessToken)
  const { pathname } = useLocation()
  const showLandingFooter = pathname !== '/' && !isAdmin

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__header-inner">
          <Link
            to={isAdmin ? '/admin' : '/'}
            className="app-shell__logo"
            aria-label="Binjari 홈"
          >
            <Armchair className="app-shell__logo-icon" aria-hidden strokeWidth={2} />
            <span className="app-shell__logo-wordmark">Binjari</span>
          </Link>
          <nav className="app-shell__nav" aria-label="계정 메뉴">
            {loggedIn ? (
              isAdmin ? (
                <>
                  <Link to="/admin" className="app-shell__link">
                    호스트 승인
                  </Link>
                  <button
                    type="button"
                    className="app-shell__link"
                    onClick={() => void signOut()}
                  >
                    로그아웃
                  </button>
                </>
              ) : (
              <>
                <Link to="/me/bookings" className="app-shell__link">
                  내 예약
                </Link>
                {isHost ? (
                  <Link to="/host/services" className="app-shell__link">
                    호스트
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="app-shell__link"
                  onClick={() => void signOut()}
                >
                  로그아웃
                </button>
              </>
              )
            ) : (
              <>
                <Link to="/auth/login" className="app-shell__link">
                  로그인
                </Link>
                <Link to="/auth/signup" className="app-shell__btn">
                  무료로 시작하기
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="app-shell__main">
        <Outlet />
      </main>
      {showLandingFooter ? (
        <footer className="app-shell__footer">
          <div className="app-shell__footer-inner">
            <span className="app-shell__footer-brand">Binjari</span>
            <nav className="app-shell__footer-links" aria-label="법적 정보">
              <a href="/#terms" className="app-shell__footer-link">
                이용약관
              </a>
              <a href="/#privacy" className="app-shell__footer-link">
                개인정보처리방침
              </a>
              <a
                href="mailto:hello@binjari.com"
                className="app-shell__footer-link"
              >
                문의
              </a>
            </nav>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
