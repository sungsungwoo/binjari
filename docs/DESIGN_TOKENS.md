# Binjari 프론트엔드 디자인 토큰

구현상 **단일 소스**는 `frontend/src/index.css`의 `:root` CSS 변수다. 본 문서는 의미·용도를 설명하고 팔레트를 표로 정리한다.

전체 톤은 [Calendly](https://calendly.com/)류 스케줄링 SaaS(밝은 그레이 배경·블루 CTA·Inter)를 참고한다.

## 원칙

- **문서를 먼저 쓸 필요는 없다.** 스타일을 바꿀 때는 `index.css`를 수정하고, 여기 표는 같이 갱신하면 된다.
- 라이트 기본, `prefers-color-scheme: dark` 시 다크 변수로 전환한다.

## 브랜드 컬러 (라이트)

| 토큰 | 용도 | HEX |
|------|------|-----|
| Primary | 주요 버튼·링크 강조 | `#006bff` |
| Primary hover | 버튼 호버 | `#0052cc` |
| Primary subtle | 배지·배경 강조 | `#e8f4ff` |
| Primary border | 연한 테두리·링 | `#c7e0ff` |
| Accent | 보조 강조 | `#3385ff` |

## 중립·텍스트 (라이트)

| 토큰 | HEX |
|------|-----|
| 배경 | `#f7f9fc` |
| 표면(카드) | `#ffffff` |
| 테두리 | `#e8eaed` |
| 본문 텍스트 | `#374151` |
| 제목 텍스트 | `#0f1419` |
| 힌트·보조 | `#6b7280` |

## 타이포

- 기본 폰트: **Inter** (Google Fonts, `index.html`에서 로드)
- 루트 `font-size`: `16px`, `line-height`: `1.6`
- 페이지 제목(`.page-shell__title`): `1.75rem` / 리드: `1rem`

## CSS 변수 매핑

| 변수 | 설명 |
|------|------|
| `--binjari-primary` | 브랜드 메인 |
| `--binjari-primary-hover` | 호버 |
| `--binjari-primary-subtle` | 연한 배경 |
| `--binjari-primary-border` | 연한 테두리·링 |
| `--binjari-shadow-primary-soft` | 주요 버튼·카드 그림자(소프트) |
| `--binjari-shadow-btn` | 헤더 등 작은 버튼 그림자 |
| `--binjari-bg` | 페이지 배경 |
| `--binjari-surface` | 카드·폼 배경 |
| `--binjari-border` | 구분선 |
| `--binjari-text` | 본문 |
| `--binjari-text-heading` | 제목 |
| `--binjari-danger-*` | 폼·API 오류 메시지 |

다크 모드에서는 동일 변수명으로 값만 덮어쓴다.

## 프론트엔드 연동

- 변수 정의: `frontend/src/index.css`
- 로컬 API URL: `frontend/.env`에 `VITE_API_BASE_URL` (예: `http://127.0.0.1:8000`). 예시는 `.env.example` 참고.
