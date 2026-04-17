# Backoffice V2 Toss UI Uplift Plan

## Goal
- `apps/backoffice-v2`를 토스식으로 더 차분하고 빠르게 읽히는 운영형 분석 화면으로 고도화한다.
- 핵심은 화려함이 아니라 `한 화면에서 바로 판단되는 정보 위계`다.

## Design Principles
- 한 화면의 첫 질문은 하나만 둔다.
- KPI는 크게, 보조 설명은 짧게 둔다.
- 카드 장식보다 정보 밀도와 클릭 동선을 우선한다.
- 네이버/쿠팡 통계는 `결제`, `정산`, `재구매`, `광고`처럼 기준이 다른 축을 섞지 않는다.
- 운영자가 자주 쓰는 필터와 드릴다운은 눈에 띄지만 과하게 설명하지 않는다.

## Reference Axes
- Toss: 짧은 문장, 명확한 액션, 넓은 여백, 큰 숫자, 가벼운 강조색
- Shopify/SaaS backoffice: 개요 카드 + 드릴다운 + 표/리스트 결합
- Naver/Coupang analytics: 채널 비교, 상품 기여도, 정산/매출 구분, 재구매 전환 흐름

## High-impact Areas
1. Global UI
- 카드, 버튼, 배지, 입력, 테이블, 사이드바 톤 통일
- 흰색 기반 표면과 얕은 그림자로 정리

2. Dashboard
- 상단 요약을 `이번 달 핵심 변화`와 KPI 중심으로 재배치
- 차트 드릴다운은 유지하되 설명 문구는 최소화

3. Channel Analysis
- 채널 카드와 비교 타임라인을 더 직접적으로 보이게 정리
- 네이버/쿠팡 2채널 기준에서 불필요한 3열 구성을 제거

4. Product Trends
- 좌측 상품 랭킹과 우측 선택 상품 상세의 대비 강화
- 옵션 중심 정보는 줄이고 매출/정산/주문 상태를 우선

5. Growth Stages
- 재구매 퍼널과 전환률을 더 먼저 보이게 구성
- 승급 후보와 단계 분포는 보조 영역으로 정리

6. Customers
- 고객 요약과 필터 패널을 더 명료하게 정리
- 분석 화면처럼 읽히되 실무 필터링 속도는 유지

7. Search Ads
- 광고 요약 KPI, 월/주/일 드릴다운, 캠페인/키워드 표를 더 선명한 위계로 정리

## Current Implementation Scope
- 글로벌 토큰과 공통 컴포넌트 톤 개선
- 기본 레이아웃, KPI 카드, 분석 핵심 페이지 스타일 개편
- `dashboard`, `channel-analysis`, `product-trends`, `growth-stages`, `customers`, `search-ads` 우선 적용

## Next Step
- 실제 운영자 피드백 기준으로 `home`, `sync`, `logs`까지 같은 톤으로 확장
- 필요 시 차트 스타일과 빈 상태 문구를 추가 정리
