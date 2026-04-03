# JHBioFarm Backoffice

- 현재 운영 앱과 `backoffice-v2` 차기 구조를 함께 관리하는 저장소다.
- 핵심 축은 `매출 분석`, `업무 자동화`, `근태 관리`다.
- 커머스 전환 작업은 `네이버 1차 + 쿠팡/카카오 확장 예정` 기준으로 `backoffice-v2`에서 진행한다.

## 먼저 볼 문서

- 전체 서비스 기준선: [docs/BACKOFFICE_ENGINEERING_HANDOFF.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/BACKOFFICE_ENGINEERING_HANDOFF.md)
- 문서 맵: [docs/DOCUMENTATION_MAP.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/DOCUMENTATION_MAP.md)
- `backoffice-v2` 커머스/API 설계: [docs/naver-commerce-api/BACKOFFICE_V2_NAVER_COMMERCE_API_DESIGN.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/naver-commerce-api/BACKOFFICE_V2_NAVER_COMMERCE_API_DESIGN.md)
- `backoffice_v2` SQL 적용 순서: [docs/sql/backoffice_v2/README.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/sql/backoffice_v2/README.md)

## 앱 구조

- 현재 운영 기준 앱: 저장소 루트
- 차기 버전 실험 앱: [apps/backoffice-v2](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/apps/backoffice-v2)

## 실행

루트 앱:

```bash
npm install
npm run dev
```

`backoffice-v2`:

```bash
cd apps/backoffice-v2
npm install
npm run dev
```

## 문서 운영 원칙

- `docs/`를 기준 문서 영역으로 본다.
- `apps/backoffice-v2/docs/`는 복제 시점 snapshot이 섞여 있으므로, 특별히 분리하지 않은 문서는 `root docs`를 먼저 본다.
- 같은 내용을 `docs/`와 `apps/backoffice-v2/docs/`에 동시에 수정하지 않는다.
