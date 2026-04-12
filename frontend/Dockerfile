# 1. 가볍고 안정적인 Node.js 최신 LTS 버전(Alpine Linux) 사용
FROM node:20-alpine

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 패키지 정보 복사 (도커 레이어 캐싱 활용)
# 소스 코드가 변경되더라도 package.json이 그대로면 npm install 과정을 건너뛰어 빌드 속도가 대폭 향상됩니다.
COPY package.json package-lock.json* ./

# 4. 의존성 설치
RUN npm install

# 5. 소스 코드 전체 복사
# (참고: docker-compose.yml에서 volumes 맵핑을 했기 때문에 로컬 파일이 이 폴더를 덮어쓰게 됩니다)
COPY . .

# 6. Vite 기본 개발 포트 노출
EXPOSE 5173

# 7. 개발 서버 (compose에서 command로 덮을 수 있음; 단독 실행 시에도 볼륨 마운트 대비)
CMD ["sh", "-c", "npm install && npm run dev -- --host 0.0.0.0"]