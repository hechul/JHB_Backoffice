# JHBioFarm Backoffice v2

- 목적: `main`을 건드리지 않고, 커머스 API 중심 구조로 재편되는 차기 버전을 별도 앱으로 검증한다.
- 현재 1차 구현 대상은 `네이버 커머스 API`다.
- 하지만 설계 목표는 `Naver -> Coupang -> Kakao` 확장이 가능한 멀티 커머스 구조다.

## 기준 문서

- v2 커머스/API 설계: [BACKOFFICE_V2_NAVER_COMMERCE_API_DESIGN.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/naver-commerce-api/BACKOFFICE_V2_NAVER_COMMERCE_API_DESIGN.md)
- 문서 맵: [DOCUMENTATION_MAP.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/DOCUMENTATION_MAP.md)
- v2 SQL 적용 순서: [README.md](/Users/huicheol/Desktop/스마트ᅳ스토어/smartstore_purchase/docs/sql/backoffice_v2/README.md)

## 실행

```bash
npm install
npm run dev
```

## 주의사항

- `.env`는 반드시 `backoffice_v2` Supabase를 보도록 설정해야 한다.
- 이 폴더 안의 `docs/`에는 root 문서 복제본이 섞여 있으므로, 특별히 분리하지 않은 문서는 `root docs`를 먼저 본다.
