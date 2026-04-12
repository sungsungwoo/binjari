/** 기본 정보 편집 중 사이드바 미리보기에 실시간 반영할 필드 */
export type LiveBasicPreview = {
  slug: string
  title: string
  description: string
  is_listed: boolean
}

export type HostServiceEditOutletContext = {
  embedded?: boolean
  /** 기본 정보 화면에서만 설정. 언마운트 시 `null`로 초기화 */
  setLiveBasicPreview?: (v: LiveBasicPreview | null) => void
}
