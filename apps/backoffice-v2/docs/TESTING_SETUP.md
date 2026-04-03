# Testing Setup (macOS)

## 1) Install (already done)
```bash
npm i -D @playwright/test vitest @vue/test-utils jsdom start-server-and-test
npx playwright install chromium
```

## 2) Run tests
```bash
npm run test:unit
npm run test:e2e
npm run test:all
```

## 3) What is covered now
- Unit: Excel parser core behavior (`tests/unit/useExcelParser.test.ts`)
- E2E: unauthenticated route-guard + login form smoke (`tests/e2e/auth-smoke.spec.ts`)

## 4) Notes
- E2E uses Playwright `webServer` in `playwright.config.ts`.
- Command used by Playwright:
  - `npm run generate && python3 -m http.server 4173 -d .vercel/output/static`
- Base URL:
  - `http://127.0.0.1:4173`

## 5) Next recommended E2E scenarios
1. Upload combined Excel (2 sheets) and verify sheet detection.
2. Verify `새 상품 연결 필요` row removal after `새로 등록` / `연결`.
3. Verify duplicate-click prevention while registering.
4. Verify canonical naming (`엔자이츄`, `이즈바이트`, `케어푸`, `두부모래`) and option rules.
