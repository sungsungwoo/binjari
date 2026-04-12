import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiPostJson, googleOAuthUrl, type AuthSuccessResponse } from '../lib/api'
import { resolvePostLoginPath } from '../lib/postLoginRedirect'
import './authForms.css'

type FromState = { from?: { pathname: string; search?: string } }

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAccessToken } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await apiPostJson<AuthSuccessResponse>(
        '/api/v1/auth/login',
        { email, password },
        { auth: false }
      )
      const token = res.data.tokens.access_token
      setAccessToken(token)
      const from = (location.state as FromState | null)?.from
      navigate(resolvePostLoginPath(token, from), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-page__title">로그인</h1>
      <p className="auth-page__subtitle">
        계정이 없으신가요? <Link to="/auth/signup">회원가입</Link>
      </p>

      {error ? <div className="auth-form__error">{error}</div> : null}

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="auth-form__field">
          <label htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-form__field">
          <label htmlFor="login-password">비밀번호</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="auth-form__submit"
          disabled={loading}
        >
          {loading ? '처리 중…' : '이메일로 로그인'}
        </button>
      </form>

      <div className="auth-divider">또는</div>

      <a className="auth-google" href={googleOAuthUrl()}>
        Google로 계속하기
      </a>
    </div>
  )
}
