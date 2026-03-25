import base64
import json
import os
import sys
import time

import bcrypt


def main() -> int:
    client_id = os.environ.get("NAVER_COMMERCE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("NAVER_COMMERCE_CLIENT_SECRET", "").strip()
    timestamp = sys.argv[1].strip() if len(sys.argv) > 1 else str(int(time.time() * 1000))

    if not client_id or not client_secret:
        raise SystemExit("NAVER_COMMERCE_CLIENT_ID and NAVER_COMMERCE_CLIENT_SECRET are required")

    password = f"{client_id}_{timestamp}".encode("utf-8")
    signature = bcrypt.hashpw(password, client_secret.encode("utf-8"))
    payload = {
        "client_id": client_id,
        "timestamp": timestamp,
        "client_secret_sign": base64.b64encode(signature).decode("utf-8"),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
