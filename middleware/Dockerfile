# 다단계 빌드 - 빌드 단계
FROM node:22-alpine AS builder

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 모든 의존성 설치 (개발 의존성 포함)
RUN npm ci

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN npm run build

# 프로덕션 단계
FROM node:22-alpine AS production

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 프로덕션 의존성만 설치
RUN npm ci --only=production

# 빌드된 파일들 복사
COPY --from=builder /app/dist ./dist

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=80

# 포트 80 노출
EXPOSE 80

# 애플리케이션 실행
CMD ["node", "dist/index.js"] 