# =====================================================================
# naver-commerce-auth.py
# 역할: 네이버 커머스 API OAuth 토큰 발급에 필요한 client_secret_sign을 생성하는 헬퍼
# 왜 Python인가: 네이버 API가 요구하는 서명 알고리즘이 bcrypt 기반인데,
#               Node.js에서 bcrypt 네이티브 모듈 설치가 까다롭기 때문에
#               Python의 bcrypt 패키지를 사용한다.
# 호출 방식: sync-naver-orders.mjs가 spawnSync로 실행 →
#            python3 scripts/lib/naver-commerce-auth.py <timestamp_ms>
# 출력: JSON 문자열 {"client_id": ..., "timestamp": ..., "client_secret_sign": ...}
# 의존성: pip install bcrypt
# =====================================================================

import base64   # bcrypt 서명 결과(bytes)를 Base64 문자열로 인코딩하기 위해 사용
import json     # 출력 결과를 JSON 형식으로 직렬화하기 위해 사용
import os       # 환경변수(NAVER_COMMERCE_CLIENT_ID 등)를 읽기 위해 사용
import sys      # CLI 인자(argv)와 종료 코드(SystemExit)를 처리하기 위해 사용
import time     # argv[1]이 없을 때 현재 시각(밀리초)을 타임스탬프로 생성하기 위해 사용

import bcrypt   # 네이버가 요구하는 bcrypt 해시 서명 생성 라이브러리 (pip install bcrypt)


def main() -> int:
    # 환경변수에서 네이버 API 인증 정보를 읽는다
    # sync-naver-orders.mjs가 spawnSync 호출 시 env에 주입해준다
    client_id = os.environ.get("NAVER_COMMERCE_CLIENT_ID", "").strip()      # 네이버 API client ID
    client_secret = os.environ.get("NAVER_COMMERCE_CLIENT_SECRET", "").strip() # 네이버 API client secret

    # argv[1]이 있으면 Node.js가 넘겨준 밀리초 타임스탬프, 없으면 현재 시각 사용
    # 타임스탬프는 서명 페이로드에 포함되어 재사용/재전송 공격을 방지한다
    timestamp = sys.argv[1].strip() if len(sys.argv) > 1 else str(int(time.time() * 1000))

    # 필수값 검증 — 없으면 비정상 종료 (exit code 1)
    if not client_id or not client_secret:
        raise SystemExit("NAVER_COMMERCE_CLIENT_ID and NAVER_COMMERCE_CLIENT_SECRET are required")

    # 서명 페이로드 생성: "client_id_timestamp" 형식의 UTF-8 바이트
    # 네이버 문서에 명시된 password 생성 규칙
    password = f"{client_id}_{timestamp}".encode("utf-8")

    # bcrypt 해시 생성
    # client_secret을 bcrypt salt로 사용 — 일반적인 bcrypt 사용법과 다름에 주의
    # 네이버가 이 방식을 명시적으로 요구한다
    signature = bcrypt.hashpw(password, client_secret.encode("utf-8"))

    # 네이버 API가 받는 최종 payload 구성
    payload = {
        "client_id": client_id,                                          # API 클라이언트 식별자
        "timestamp": timestamp,                                          # 서명에 사용된 타임스탬프
        "client_secret_sign": base64.b64encode(signature).decode("utf-8"), # bcrypt 결과를 Base64로 인코딩
    }

    # JSON 직렬화 후 stdout 출력 — Node.js 부모 프로세스가 stdout을 파싱해 사용
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    # main() 반환값(0)을 종료 코드로 사용
    # 에러 시 raise SystemExit("message")로 비정상 종료 → Node.js가 stderr로 확인
    raise SystemExit(main())
