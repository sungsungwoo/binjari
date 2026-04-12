import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiPostJson, googleOAuthUrl, type AuthSuccessResponse } from '../lib/api'
import { postLoginDefaultPath } from '../lib/postLoginRedirect'
import './authForms.css'

export function SignupPage() {
  const navigate = useNavigate()
  const { setAccessToken } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupType, setSignupType] = useState<'member' | 'host'>('member')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    setLoading(true)
    try {
      const res = await apiPostJson<AuthSuccessResponse>(
        '/api/v1/auth/signup',
        { email, password, name, signup_type: signupType },
        { auth: false }
      )
      const token = res.data.tokens.access_token
      setAccessToken(token)
      navigate(postLoginDefaultPath(token), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-page__title">회원가입</h1>
      <p className="auth-page__subtitle">
        이미 계정이 있으신가요? <Link to="/auth/login">로그인</Link>
      </p>

      {error ? <div className="auth-form__error">{error}</div> : null}

      <form className="auth-form" onSubmit={onSubmit}>
        <div className="auth-form__field auth-form__field--radios">
          <span className="auth-form__label-text">가입 유형</span>
          <label className="auth-form__radio">
            <input
              type="radio"
              name="signup_type"
              value="member"
              checked={signupType === 'member'}
              onChange={() => setSignupType('member')}
            />
            일반 회원 — 예약·내 예약 (바로 이용)
          </label>
          <label className="auth-form__radio">
            <input
              type="radio"
              name="signup_type"
              value="host"
              checked={signupType === 'host'}
              onChange={() => setSignupType('host')}
            />
            호스트 — 예약 페이지 운영 (관리자 승인 후)
          </label>
        </div>
        <div className="auth-form__field">
          <label htmlFor="signup-name">이름</label>
          <input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={1}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="auth-form__field">
          <label htmlFor="signup-email">이메일</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-form__field">
          <label htmlFor="signup-password">비밀번호</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="auth-form__submit"
          disabled={loading}
        >
          {loading ? '처리 중…' : '가입하기'}
        </button>
      </form>

      <div className="auth-divider">또는</div>

      <a className="auth-google" href={googleOAuthUrl()}>
        Google로 가입하기
      </a>
    </div>
  )
}
