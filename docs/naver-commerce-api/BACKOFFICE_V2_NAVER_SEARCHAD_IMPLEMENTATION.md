# Backoffice v2 Naver SearchAd Integration

- 기준 날짜: 2026-04-06
- 목적: `apps/backoffice-v2`에 네이버 검색광고 데이터를 읽기 전용 분석 화면으로 붙여 커머스 성과와 광고 성과를 병렬로 볼 수 있게 한다.

---

## 1. 적용 원칙

- 검색광고 데이터는 `커머스 결제 데이터`와 분리해서 본다.
- `광고비`, `구매 전환매출`, `ROAS`는 모두 `광고 기준`으로만 표기한다.
- 커머스 `결제 금액`, `정산 예정`, `순매출`과 기본 합산하지 않는다.
- 초기 구현은 `실시간 API read-only`로 운영한다.

---

## 2. 이번 구현 범위

### 2-1. 공식 SearchAd API 연결

- 인증 헤더
  - `X-Timestamp`
  - `X-API-KEY`
  - `X-Customer`
  - `X-Signature`
- 서명 방식
  - `timestamp.method.uri`
  - `secret key` 기반 HMAC-SHA256
  - Base64 인코딩

### 2-2. 사용 엔드포인트

- `/ncc/campaigns`
  - 캠페인 리스트
- `/ncc/adgroups`
  - 캠페인별 광고그룹 리스트
- `/ncc/keywords`
  - 광고그룹별 키워드 리스트
- `/stats`
  - 비용/노출/클릭/구매전환 성과
- `/keywordstool`
  - 연관 키워드와 검색량/경쟁도

### 2-3. 현재 화면에 반영한 지표

- 광고비
- 노출수
- 클릭수
- CTR
- 평균 CPC
- 전체 전환수
- 구매 전환수
- 구매 전환매출
- ROAS
- 상위 캠페인
- 상위 광고그룹
- 상위 키워드
- 연관 키워드

---

## 3. 구현 파일

### 3-1. 공유 타입

- `apps/backoffice-v2/shared/naverSearchAd.ts`

### 3-2. 서버

- `apps/backoffice-v2/server/utils/searchad/naver-searchad.ts`
  - SearchAd 서명/요청 유틸
  - 기간 preset 처리
  - 캠페인/광고그룹/키워드/통계 집계
- `apps/backoffice-v2/server/api/ads/naver-searchad/overview.get.ts`
  - 백오피스 내부 API

### 3-3. 프론트

- `apps/backoffice-v2/app/pages/search-ads.vue`
  - 검색광고 분석 화면
- `apps/backoffice-v2/app/layouts/default.vue`
  - 사이드바 `검색광고` 메뉴 추가

### 3-4. 환경 변수

- `apps/backoffice-v2/.env.example`
  - `NAVER_SEARCHAD_CUSTOMER_ID`
  - `NAVER_SEARCHAD_ACCESS_LICENSE`
  - `NAVER_SEARCHAD_SECRET_KEY`
  - `NAVER_SEARCHAD_API_BASE_URL`

---

## 4. 현재 계정 기준 확인된 것

실계정 프로브 결과, 현재 계정에서는 아래가 정상 응답한다.

- 캠페인 목록
- 광고그룹 목록
- 키워드 목록
- 최근 30일 기준 비용/노출/클릭/구매 전환/구매 전환매출
- 연관 키워드와 월간 검색량/경쟁도

즉 1차 읽기 전용 광고 분석 화면을 운영하기에는 충분한 데이터가 나온다.

---

## 5. 현재 한계

- 키워드 성과는 `상위 광고그룹` 기준으로 우선 수집한다.
  - 전체 계정 모든 광고그룹/키워드를 전부 실시간으로 훑는 구조는 1차에서 과하다.
- 광고 전환매출은 SearchAd attribution 기준이다.
  - 커머스 결제 금액과 직접 비교할 때는 기준 라벨이 필요하다.
- DB 적재/스냅샷은 아직 안 붙였다.
  - 현재는 read-only live fetch다.

---

## 6. 다음 단계

1. SearchAd 일별 스냅샷 적재 테이블 설계
2. 월 마감 스냅샷과 live 모드 분리
3. 상품 성과 / 채널 성과에 광고 보조 패널 추가
4. 키워드-상품군 매핑 규칙 도입
