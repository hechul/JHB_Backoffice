# Playwright 공식 이미지 (Chromium + 의존성 포함)
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# 의존성 설치
COPY package.json ./
RUN npm install --omit=dev

# 소스 복사
COPY . .

# Render는 PORT 환경변수를 자동으로 설정함
ENV PORT=3001
EXPOSE 3001

CMD ["node", "index.js"]
