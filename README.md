# 픽토리

Apps in Toss용 앨범 정리 미니앱 복구본입니다.

## 실행

```bash
npm install
npm run dev
```

개발 브라우저에서 실제 파일 선택 테스트를 할 때는 다음 명령도 사용할 수 있습니다.

```bash
npm run web:dev
```

## 검증

```bash
npm run test
npm run typecheck
npm run lint
npm run qa:server:built
npm run check:production-env -- --file .env.production
npm run check:device-evidence -- --file qa-evidence/device-smoke.json
npm run build
npm run snapshot:release
```

`npm run build`는 `pictory.ait`를 생성합니다.
`npm run qa:server:built`는 서버 API를 `dist-server`로 빌드한 뒤 실제 Node
프로세스로 띄워 `/healthz`, `/pictory/entitlement`, `/pictory/classify`,
`/pictory/account`를 smoke 검증합니다.
`npm run check:production-env -- --file .env.production`은 운영 후보 환경값이
테스트 광고 ID, placeholder endpoint, SKU 불일치, 짧은 secret, mTLS 파일 누락,
원본 이미지 로그 설정 실수로 배포되지 않게 막습니다. `.env.production`은
저장소에 커밋하지 않습니다.
`npm run check:device-evidence -- --file qa-evidence/device-smoke.json`은
앱인토스 콘솔 QR을 실제 토스 앱에서 스캔한 증거를 검사합니다. 증거 JSON에는
현재 `pictory.ait` SHA-256, 토스 앱 버전, QR 시각, 사진 권한, 앨범 선택,
분류 탭, 민감정보 흐림, 보상형 광고, 결제 지급, 미결 주문 복원, 계정 삭제
스크린샷 경로가 있어야 합니다. 형식 예시는
`docs/device-smoke-evidence.example.json`입니다.
`npm run snapshot:release`는 현재 Git commit, GitHub private repo 상태,
`pictory.ait` SHA-256, 필수 검증 명령을 로컬 최신본
`docs/release-snapshot.json`과 Git 보존용 `docs/release-snapshots/*.json`에
남깁니다. 이 파일에는 secret이나 실제 운영 env 값을 넣지 않습니다.

## 운영 설정

보상형 광고는 기본값으로 앱인토스 테스트 광고 ID를 사용합니다.

```bash
cp .env.example .env
```

클라이언트 공개 환경 변수는 `VITE_` 접두사를 사용하며 앱 번들에 포함될 수 있습니다. 비밀값을 넣지 않습니다.

```bash
VITE_TOSS_REWARDED_AD_GROUP_ID=ait-ad-test-rewarded-id
VITE_PICTORY_PLUS_SUBSCRIPTION_SKU=replace_with_toss_plus_subscription_sku
VITE_PICTORY_PRO_SUBSCRIPTION_SKU=replace_with_toss_pro_subscription_sku
VITE_PICTORY_CLASSIFY_ENDPOINT=https://your-api.example.com/pictory/classify
VITE_PICTORY_REWARD_ENDPOINT=https://your-api.example.com/pictory/reward
VITE_PICTORY_ENTITLEMENT_ENDPOINT=https://your-api.example.com/pictory/entitlement
VITE_PICTORY_DELETE_ENDPOINT=https://your-api.example.com/pictory/account
```

출시 빌드에서는 앱인토스 콘솔에서 발급받은 보상형 광고 그룹 ID와 구독 SKU로 바꿉니다. 개발 단계에서는 반드시 테스트 ID(`ait-ad-test-rewarded-id`)를 사용합니다. 실제 광고 ID로 개발 테스트를 반복하면 광고 정책 위반으로 간주될 수 있습니다.

서버 AI 분류 API는 별도 서버 런타임에서만 아래 값을 사용합니다. OpenAI 키와 서버 secret에는 `VITE_` 접두사를 붙이지 않고, 프론트엔드 `.env`나 앱 코드에 실제 값을 넣지 않습니다.

```bash
PICTORY_SERVER_SECRET=replace_with_long_random_server_secret
PICTORY_SESSION_SECRET=replace_with_long_random_session_secret
PICTORY_PLUS_SUBSCRIPTION_SKU=replace_with_toss_plus_subscription_sku
PICTORY_PRO_SUBSCRIPTION_SKU=replace_with_toss_pro_subscription_sku
PICTORY_SUBSCRIPTION_VALID_DAYS=32
APPS_IN_TOSS_MTLS_CERT_PATH=replace_with_server_only_mtls_cert_path
APPS_IN_TOSS_MTLS_KEY_PATH=replace_with_server_only_mtls_key_path
OPENAI_API_KEY=replace_with_openai_api_key_server_only
OPENAI_MODEL=gpt-4.1-mini
OPENAI_IMAGE_DETAIL=low
PICTORY_AI_FREE_MONTHLY_QUOTA=0
PICTORY_AI_AD_CREDIT_QUOTA=100
PICTORY_AI_PLUS_MONTHLY_QUOTA=500
PICTORY_AI_PRO_MONTHLY_QUOTA=2000
PICTORY_AI_DAILY_LIMIT_PER_USER=300
PICTORY_AI_RATE_LIMIT_PER_MINUTE=30
PICTORY_AI_LOG_RAW_IMAGES=false
```

앱인토스 QR 테스트, 광고 운영, 서버 AI 분류 API 계약은 `docs/apps-in-toss-test-and-monetization.md`를 기준으로 확인합니다.

## 구현 범위

- Apps in Toss `photos` 권한과 `fetchAlbumPhotos`/`fetchAlbumItems` 연결
- 브라우저 개발 환경용 실제 이미지 파일 선택
- 캔버스 기반 이미지 신호 분석과 종류/정리 후보 분류
- 운영 서버 AI 분류 endpoint 연결부와 OpenAI Responses API 기본 분류기
- 서버 권위 광고 크레딧/유료 월 quota 원장 모듈
- 서명 세션 쿠키/Authorization 토큰 기반 서버 subject 검증
- 사용자별 서버 AI 일일/분당 이미지 수 제한
- 배포 런타임에 붙일 수 있는 `POST /pictory/classify` HTTP 어댑터
- 앱인토스 주문 상태 조회 결과로 구독 권한을 서버 원장에 반영하는 `POST /pictory/entitlement` HTTP 어댑터
- 광고 보상 크레딧을 원장에 지급하는 `POST /pictory/reward` HTTP 어댑터
- 서버 원장 계정을 지우는 `DELETE /pictory/account` HTTP 어댑터
- `health/classify/reward`를 실제 HTTP로 검증하는 Node 서버 런타임
- 홈, 지도, 정리, 보관 4개 화면
- 보상형 광고 연결부와 브라우저 fallback
- 광고 보상 후 서버 원장 동기화 endpoint 연결부
- 민감/확인 필요 후보 흐림 처리와 로컬 저장 상태 관리
- 앱 재실행 후에도 최근 분류 지도, 보관 항목, 스캔 기록 복원

## 서버 런타임 검증

```bash
npm run qa:server
npm run qa:server:built
```

`qa:server`는 Node HTTP 런타임으로 `/healthz`, `/pictory/reward`,
`/pictory/classify`, `/pictory/account`, `/pictory/entitlement`를 실제 포트에서 호출하고, 파일 원장
저장소가 이미지 본문 없이 사용량만 저장하며 계정 삭제가 되는지 확인합니다.
`qa:server:built`는 배포용 서버 bundle을 실제 `node dist-server/pictoryNodeRuntime.js`로
기동 가능한지 확인합니다.
브라우저 앱은 서버 secret을 보내지 않으므로 운영 배포에서는 Node 런타임의
`PICTORY_SESSION_SECRET`으로 검증되는 `pictory_session` 쿠키/Authorization
토큰, `resolveSubjectId` 옵션, 또는 게이트웨이 미들웨어로 동일 출처 세션
쿠키/토스 세션을 검증해 subject를 주입해야 합니다. 기본 헤더 secret 방식은
서버 간 호출 검증용입니다.
구독 결제 상품 지급 콜백은 `VITE_PICTORY_ENTITLEMENT_ENDPOINT`로 `orderId`를
보내고, 서버는 앱인토스 주문 상태 조회 API를 mTLS로 호출해 SKU와 상태를
검증한 뒤 원장에 Plus/Pro 권한을 반영합니다. 운영 서버에는 앱인토스 콘솔에서
발급한 mTLS 인증서/키 경로와 서버용 SKU 환경 변수를 설정해야 합니다.

## 앨범 fallback 정책

- 로컬 개발환경(`localhost`, `127.0.0.1`, Vite dev)에서만 샘플 앨범과 브라우저 파일 선택 fallback을 사용합니다.
- 운영/토스 앱 환경에서 앨범 권한, 토스 앱 버전, 네이티브 API 문제가 생기면 샘플 데이터로 덮지 않고 사용자에게 실패 상태를 보여줍니다.
- `fetchAlbumItems`에서 사용자가 선택을 취소하면 빈 배열로 처리하고, 실패로 간주하지 않습니다.

## 개인정보 저장 방식

- 원본 사진은 저장하지 않습니다.
- 최근 분류 결과는 앱 안의 로컬 저장소에 작은 썸네일과 분류 메타데이터만 보관합니다.
- 민감정보 후보는 실제 이미지 썸네일 대신 차단용 대체 이미지를 저장합니다.
- `픽토리 데이터 삭제`를 누르면 저장된 보관 상태, 정리 후보, 최근 분류 결과, 스캔 기록을 모두 삭제합니다.
- `VITE_PICTORY_DELETE_ENDPOINT`가 설정된 운영 환경에서는 `픽토리 데이터 삭제`가 서버 원장 삭제도 함께 요청합니다.
- 운영 환경에서는 로컬 저장소의 유료 플랜 값을 실제 권한으로 믿지 않습니다. 인앱결제 지급·복원·주문 상태 검증이 붙기 전까지 Plus/Pro는 로컬 개발 미리보기에서만 한도로 적용됩니다.
- 운영 Plus/Pro 활성화는 앱인토스 구독 결제 성공, 상품 지급 콜백, 구독 정보 복원 또는 미결 주문 복원 이후에만 적용됩니다.

## 운영 전 확인해야 할 것

- 실제 토스 앱 또는 콘솔 QR 테스트에서 사진 권한 요청과 앨범 읽기 확인
- 운영 광고 그룹 ID 적용 후 `userEarnedReward` 이벤트 발생 시에만 스캔권 지급되는지 확인
- 광고 미지원/닫기/실패 상태에서 스캔권이 지급되지 않는지 확인
- Plus/Pro 구독 SKU 적용 후 실기기에서 결제 성공, 미결 주문 복원, 구독 복원 상태 확인
- `pictory.ait` 최신 빌드 업로드 전 `npm run test && npm run typecheck && npm run lint && npm run build` 재실행
