# 픽토리 다음 세션 인수인계

이 문서는 다른 Codex 세션이 픽토리 작업을 바로 이어받기 위한 기준 문서입니다.

## 먼저 지켜야 할 것

- 모든 보고는 한국어로 하고 사용자를 `마스터`라고 부른다.
- 기준 작업 폴더는 `C:\Users\50106\Desktop\pictory`다.
- 프로젝트 지침은 `AGENTS.md`를 먼저 읽고 따른다.
- 실제 사진 원본은 외부로 보내지 않는다. 기본 분류는 브라우저/토스 WebView 안에서 처리한다.
- 서버 AI 분류는 사용자가 명시적으로 선택한 이미지와 비용 제한 안에서만 사용한다.
- 실제 앨범 삭제 API가 없는 상태에서 삭제 완료처럼 표현하지 않는다. 앱 내부 정리 후보/보관 상태로 표현한다.
- API 키, mTLS 인증서, Toss 콘솔 값, 결제 SKU 같은 실서비스 값은 코드에 직접 쓰지 않는다.

## 현재 프로젝트 상태

- 앱 이름: `픽토리`
- appName: `pictory`
- Apps in Toss 콘솔로 만든 미니앱 URL: `https://apps-in-toss.toss.im/workspace/50169/mini-app/42928/home`
- Git 원격 저장소: `https://github.com/Artemis-ignis/pictory-apps-in-toss.git`
- 현재 브랜치: `main`
- 최근 커밋:
  - `84cae8b Archive server AI accounting release snapshot`
  - `fa4de25 Harden server AI response accounting`
  - `a3ce369 Archive privacy guard release snapshot`
  - `e97d322 Guard release privacy and stabilize map flow`
- 현재 `.ait` 파일: `pictory.ait`
- 현재 `.ait` SHA256: `4b8a5d1006c14181a50463e24be1e7dd767a9c1c5a595b5a51114385944598d8`

## 지금 검증된 것

다음 명령은 통과했다.

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
npm run snapshot:release
npm run qa:flow
npm run qa:flow:built
npm run qa:server:built
npm run check:privacy
npm run check:upload-assets
npm run check:release
npx vitest run tests/releaseReadiness.test.mjs
npm run typecheck
npm run lint
npm run qa:flow
npm run build
npm run qa:flow:built
npm run snapshot:release
npm run check:release
npm run test
npm run evidence:device:draft -- --force
npm run check:launch
```

이번 세션에서 추가로 다시 확인한 명령:

```powershell
npm run check:upload-assets
npm run check:privacy
npm run qa:server
npm run qa:flow
npm run qa:server:built
npm run qa:flow:built
npm run check:submission
node tools/write-production-env-draft.mjs --guide-only
npm run check:production-env -- --file .env.production
npm run check:device-evidence -- --file qa-evidence/device-smoke.json
npx vitest run tests/deviceEvidenceDraft.test.mjs tests/deviceEvidenceCheck.test.mjs tests/launchReadiness.test.mjs
npx vitest run tests/productionEnvCheck.test.mjs tests/runtimeEnvGuard.test.ts tests/launchReadiness.test.mjs
npm run lint
npm run test
npm run typecheck
npm run qa:server
npm run build
npm run snapshot:release
npm run evidence:device:draft -- --force
npm run qa:server:built
npm run qa:flow
npm run qa:flow:built
npm run check:privacy
npm run check:upload-assets
npm run check:release
```

확인된 내용:

- `pictory.ait` 존재
- `pictory.ait` 압축 해제 크기 100MB 이하 검사 통과
- `granite.config.ts` 앱인토스 설정 존재
- 사진 읽기 권한 설정 존재
- 테스트/빌드/출시 체크 스크립트 존재
- 서버 어댑터, 사용량 장부, 보상 광고, 구독 권한, 삭제 요청, 런타임 가드 파일 존재
- 릴리즈 스냅샷이 현재 `.ait` 해시와 일치
- 최신 릴리즈 스냅샷 archive: `docs/release-snapshots/84cae8b2054b-75340fabceed.json`
- `dist`, `dist-server`, `pictory.ait`에 서버 비밀값이나 서버 환경변수 직접 참조가 섞이지 않음
- `pictory.ait` 내부 파일 목록을 읽어 로컬 `demo-album` 파일이 업로드 산출물에 섞이지 않았는지 확인함
- `npm run check:release`는 `tar -tvf` 기준으로 `.ait` 내부 파일 목록과 압축 해제 크기를 검사하고, 일반 tar 샘플은 내장 파서로 테스트함
- `npm run check:launch`는 `tar -tf`/`tar -xOf`로 `pictory.ait` client config placeholder 포함 여부를 검사함
- `npm run qa:flow`는 `qa-evidence/runtime-flow.json`을 만들고, `npm run check:release`는 이 런타임 QA 증거를 검사함
- `npm run qa:flow`는 홈 가져오기 모드 `최신순/오래된순/날짜/인스타` 전환과 날짜 입력 노출도 검사함
- `npm run qa:flow`는 민감정보 후보 상세에서 기본 마스크가 뜨고, 방금 가져온 실제 사진은 `보기` 버튼으로 이 화면에서 확인할 수 있는지도 검사함
- `npm run qa:flow:built`는 `dist/web` preview를 검증하고 `qa-evidence/built-flow.json`을 만들며, 홈 가져오기 모드 전환도 함께 검사함
- `npm run qa:flow:built`는 저장된 민감 썸네일 상태에서 원본 보기 버튼이 노출되지 않는지도 검사함
- `npm run check:submission`은 타입체크, 린트, 테스트, 서버 QA, 빌드, 런타임 QA, privacy/upload asset 검사, release snapshot, release readiness, launch readiness를 순서대로 실행하고 중간 실패 시 멈춤
- 앱인토스 `앱 내 기능` 등록안은 `docs/apps-in-toss-app-functions.json`과 `docs/apps-in-toss-app-functions.md`에 정리됨
- 앱 내 기능 URL은 `intoss://pictory/?tab=home`, `intoss://pictory/?tab=map`, `intoss://pictory/?tab=clean`, `intoss://pictory/?tab=saved`를 사용함
- `npm run qa:flow`와 `npm run qa:flow:built`는 위 앱 내 기능 URL이 홈/분류/정리/보관으로 직접 진입하는지 검사함
- `npm run check:release`는 앱 내 기능 manifest의 한국어/영어 이름 길이, 허용 문자, `intoss://pictory` URL, target tab 일치를 검사함
- `npm run qa:flow` 기본 포트는 5173, `npm run qa:flow:built` 기본 포트는 6173이라 병렬 실행 시 포트 충돌을 피함
- `npm run check:upload-assets`는 `apps-in-toss-upload-images`의 아이콘/썸네일/홈/분류/정리/보관 이미지 치수를 검사함
- release snapshot의 필수 검증 목록에는 `npm run check:launch`까지 포함됨
- 픽토리의 분류 화면은 실제 거리 지도나 GPS 핀 지도가 아니라 앱 내부 사진 묶음 안내 화면임
- 네이버 지도 SDK, 위치 지도 QA, GPS 좌표 수집은 제품 목표에서 제외함
- `npm run qa:real-upload`는 실제 업로드 JPEG 10장을 파일 선택으로 넣어 분류/정리/상세/보관/삭제 흐름이 작동하는지 검사함
- `npm run check:submission`은 `check:launch` 직전까지 통과했고, `check:launch`는 운영값/실기기 증거 부족으로 정상 차단됨
- 운영 환경값 안내서 `.env.production.README.md`가 생성됨
- 실기기 증거 안내서 `qa-evidence/screens/README.md`와 초안 `qa-evidence/device-smoke.json`이 생성됨
- 홈 화면에서 가져오기 방식을 `최신순`, `오래된순`, `날짜`, `인스타`로 선택할 수 있음
- 앱인토스 앨범 API에는 정렬/기간 파라미터가 없으므로 픽토리 내부에서 가능한 범위로 정렬/필터를 적용함
- 자동 가져오기에서 `오래된순`, `날짜`, `인스타`는 플랜 분석 한도보다 넓은 후보 창을 먼저 가져오고, 실제 분석은 다시 한도만큼 자름
- 사진 권한 거부는 “권한 허용” 안내로, SDK/버전/사진첩 실패는 “토스 앱 버전이나 사진첩 상태” 안내로 분기됨
- 서버 AI provider는 Gemini 기본, OpenAI fallback 구조임
- 광고 보상은 1회 30장, 일 90장, 월 300장, 저장 300장 기준으로 조정됨
- 보상형 광고 서버 지급은 `PICTORY_REWARD_UNIT_TYPE=ai_credit`와 `PICTORY_AI_AD_CREDIT_QUOTA=30`이 실제 이벤트 `unitType`/`unitAmount`와 일치할 때만 승인됨
- 무료 사용자가 월 기본 정리분 안에서 서버 AI를 실제 적용해도 광고 AI 크레딧은 사진 장수만큼 차감됨
- 서버 AI가 실패하면 예약 당시 월 quota/광고 크레딧/전역 일일 한도 사용분을 정확히 기록해 그대로 환불함
- `VITE_PICTORY_ENTITLEMENT_ENDPOINT`가 없는 운영 빌드는 Plus/Pro 결제창을 열거나 미결 주문 복원으로 유료 권한을 활성화하지 않음
- 설치된 `@apps-in-toss/web-framework`에는 `IAP.createSubscriptionPurchaseOrder`와 `IAP.getSubscriptionInfo`가 있으며, Plus/Pro는 구독 SKU + 서버 entitlement 검증 구조로 유지함
- `node tools/write-production-env-draft.mjs --guide-only`는 기존 `.env.production`을 덮지 않고 `.env.production.README.md` 운영값 입력 가이드만 생성함
- 로컬 `.env.production`에는 비밀값 출력 없이 `PICTORY_REWARD_UNIT_TYPE=ai_credit`를 추가해 보상 단위 누락 차단은 제거함
- `npm run evidence:device:draft -- --force`는 `qa-evidence/screens/README.md`에 실기기 캡처 가이드를 함께 생성함

다음 명령은 아직 막혀 있다.

```powershell
npm run check:launch
```

막힌 이유:

- `.env.production`이 아직 실서비스 값이 아니라 placeholder다.
- 현재 `dist`/`pictory.ait`도 placeholder client config로 빌드되어 있으므로, `.env.production`을 실제 값으로 채운 뒤 `npm run build`, `npm run snapshot:release`, `npm run evidence:device:draft -- --force`를 다시 실행해야 한다.
- `NODE_ENV=production`은 Vite가 읽는 `.env.production`에 넣지 말고 실제 서버 프로세스/배포 환경에서 설정해야 한다. `npm run check:production-env`는 `.env.production` 안의 `NODE_ENV` 키를 차단한다.
- Toss 광고 그룹 ID, 구독 SKU, 분류/보상/권한/삭제 API HTTPS 엔드포인트가 실제 운영값으로 들어가야 한다.
- 앱인토스 보상형 광고 콘솔의 보상 단위는 현재 서버 정책과 같은 `ai_credit`, 보상량 30으로 맞춰야 한다.
- `npm run check:production-env`와 서버 runtime env guard는 `PICTORY_AI_AD_CREDIT_QUOTA=30`을 요구한다. 광고 보상량을 바꾸려면 실기기 증거, 서버 정책, 문서, 테스트를 함께 바꾼다.
- 실기기 증거 JSON의 `monetization.rewardedAd`에는 운영 광고 그룹 ID, `unitType: "ai_credit"`, `unitAmount: 30`, `serverGrantedCredits: 30`, `usingTestAdGroup: false`가 필요하다.
- `운영_보상형_광고_그룹_ID` 같은 placeholder 또는 `ait-ad-test-rewarded-id` 테스트 광고 그룹 ID는 `npm run check:device-evidence`와 `npm run check:launch`에서 차단된다.
- Gemini API 키는 서버 전용 실키로 설정해야 한다. OpenAI는 `PICTORY_AI_PROVIDER=openai`로 명시할 때만 fallback으로 사용한다.
- Apps in Toss mTLS 인증서/키 경로가 실제 파일로 설정되어야 한다.
- 실제 Toss 기기에서 콘솔 QR을 스캔한 증거가 없다.
- 사진 권한, 앨범 선택, 분류 탭, 개인정보 마스킹, 보상 광고, IAP 구매 권한 부여, pending order 복구, 계정 삭제 플로우 스크린샷 증거가 없다.
- 공개 문서 검색에서는 일회성 IAP 문서가 먼저 잡히지만, 설치 SDK 원문에는 구독 API가 존재한다. 임의로 `createOneTimePurchaseOrder`로 되돌리지 말고 실기기에서 구독 주문/복원 플로우를 확인한다.

## 주요 실행 명령

패키지 매니저는 `package-lock.json` 기준으로 npm을 쓴다.

```powershell
npm install
npm run web:dev
npm run test
npm run lint
npm run typecheck
npm run build
npm run check:release
npm run check:launch
```

운영 환경 가이드만 다시 만들 때:

```powershell
node tools/write-production-env-draft.mjs --guide-only
```

서버 쪽 확인:

```powershell
npm run qa:server
npm run qa:server:built
```

앱 플로우 확인:

```powershell
npm run qa:flow
npm run qa:flow:built
```

초안 파일 생성:

```powershell
npm run env:production:draft
npm run evidence:device:draft
```

## 중요한 파일

- `AGENTS.md`: 이 프로젝트 작업 규칙
- `README.md`: 프로젝트 설명과 운영 개요
- `granite.config.ts`: Apps in Toss 앱 설정
- `pictory.ait`: 현재 앱인토스 업로드 번들
- `docs\apps-in-toss-app-functions.json`: 앱인토스 콘솔 앱 내 기능 등록값
- `docs\apps-in-toss-app-functions.md`: 앱 내 기능 콘솔 입력 가이드
- `.env.example`: 환경변수 예시
- `.env.production`: 실서비스 환경값 자리, 비밀값 출력 금지
- `src\App.tsx`: 앱 라우팅/상태 중심
- `src\pages\HomePage.tsx`: 홈
- `src\pages\MapPage.tsx`: 분류, 종류별 묶음 진입
- `src\pages\CleanPage.tsx`: 정리 후보
- `src\pages\SavedPage.tsx`: 보관
- `src\pages\PhotoDetailPage.tsx`: 사진 묶음/상세 페이지
- `src\features\album\classifier.ts`: 기본 분류 로직
- `src\features\album\albumAdapter.ts`: 앱인토스 앨범/파일 가져오기, 최신순/오래된순/날짜/인스타 모드
- `src\features\album\aiClassifier.ts`: AI 분류 연결
- `src\features\album\imageSignals.ts`: 이미지 신호 추출
- `src\features\ads\rewardAd.ts`: 보상 광고 연결
- `src\features\billing\iap.ts`: 인앱결제 연결
- `server\pictoryClassify.ts`: 서버 AI 분류
- `server\pictoryUsageLedger.ts`: AI 사용량/크레딧 장부
- `server\pictoryRewardHttpAdapter.ts`: 보상 광고 서버 어댑터
- `server\pictoryEntitlementHttpAdapter.ts`: 구독 권한 서버 어댑터
- `server\pictoryNodeRuntime.ts`: Node 서버 런타임
- `tools\check-launch-readiness.mjs`: 최종 출시 전 차단 항목 검사
- `tools\write-device-evidence-draft.mjs`: 실기기 QA 증거 JSON/스크린샷 가이드 생성
- `tools\check-device-evidence.mjs`: 실기기 QR, 사진 권한, 광고/IAP/삭제 증거 검사
- `tools\check-release-readiness.mjs`: `.env.example`, Granite 설정, 앱 내 기능 manifest, 스냅샷, privacy, 런타임 QA 증거, `.ait` 내부 demo 파일 누락 검사
- `tools\check-upload-assets.mjs`: 앱인토스 콘솔 제출 이미지 치수 검사
- `apps-in-toss-upload-images\`: 콘솔 업로드용 아이콘, 썸네일, 홈/분류/정리/보관 스크린샷
- `qa-evidence\runtime-flow.json`: 홈/분류/정리/보관 브라우저 런타임 QA 증거
- `qa-evidence\built-flow.json`: `dist/web` preview 빌드 화면 QA 증거
- `tools\apps-in-toss-maker\create-app.mjs`: Codex 없이 새 앱인토스 미니앱을 만드는 로컬 생성기

## 제품 방향

픽토리는 단순 데모가 아니라 상용 앱인토스 미니앱 기준으로 가야 한다.

- 사용자는 앨범에서 사진을 직접 선택하거나, 대량 정리를 시작할 수 있어야 한다.
- 분류/정리/보관 목록에서 항목을 누르면 그 페이지 밑에 펼치는 방식이 아니라, 실제 사진 묶음 페이지로 진입해야 한다.
- 분류는 실제로 쓸모 있어야 한다. 예: 인물, 음식, 장소, 문서, 영수증, 캡처, 어두운 사진, 비슷한 사진, 민감정보 후보, 보관 후보.
- 민감정보 후보는 삭제를 강요하지 말고 확인/마스킹/보관 판단을 돕는 식으로 보여준다.
- 보상 광고는 크레딧 충전, 구독은 보관/월간 크레딧/대량 정리 한도 확장에 연결한다.
- 서버 AI 비용이 매출보다 커지지 않게 무료/광고/구독별 월간 쿼터와 일일 제한을 반드시 유지한다.
- 사진 가져오기는 앱인토스 SDK 한계를 속이지 말고, 가능한 필터와 실기기 확인이 필요한 항목을 구분한다.

## 사진 가져오기 정책

상세 내용은 `docs/photo-import-strategy.md`를 본다.

- `fetchAlbumItems` 공식 옵션은 `types`, `maxCount`, `maxWidth`, `base64`다.
- `fetchAlbumPhotos` 공식 옵션은 `maxCount`, `maxWidth`, `base64`다.
- 최신순/오래된순/날짜/인스타 전용 파라미터는 공식 문서와 설치된 SDK 타입에서 확인되지 않았다.
- 현재 픽토리는 가져온 항목의 `createdAt`과 이미지 신호를 기준으로 내부 정렬/필터를 적용한다.
- 자동 가져오기에서 최신순이 아닌 모드는 후보 탐색 창을 최대 300장까지 넓힌 뒤 내부 정렬/필터를 적용하고, 실제 분석은 플랜 한도까지만 진행한다.
- 실제 토스앱에서 반환 순서와 촬영일 메타데이터 보존 여부는 실기기 QR 테스트로 확인해야 한다.

## 현재 Chrome 상태

현재 세션에서 `@chrome` 플러그인 번들과 Chrome 설치는 확인됐다.

- Chrome 설치/실행: 정상
- Chrome 플러그인 파일: 존재
- `browser-client.mjs`: 존재

현재 세션에서는 `mcp__node_repl__js` 도구가 노출되어 시스템 Chrome headless로 `http://127.0.0.1:5173` 홈 화면 렌더, 홈/분류/정리/보관 탭 전환, 콘솔 에러 0개를 확인했다. 다만 Apps in Toss 콘솔 로그인 세션을 쓰는 실제 업로드 자동화는 별도 Chrome 제어 상태를 다시 확인해야 한다.

## 다음 세션 첫 작업 순서

1. `C:\Users\50106\Desktop\pictory`에서 시작한다.
2. `AGENTS.md`, 이 파일, `README.md`, `package.json`, `granite.config.ts`를 읽는다.
3. `git status --short`로 마스터의 미반영 변경이 있는지 확인한다.
4. `npm run check:release`를 다시 돌려 현재 번들이 깨지지 않았는지 확인한다.
5. Apps in Toss 콘솔에서 `pictory.ait` 업로드 또는 앱 정보 등록을 진행한다.
6. 실서비스 환경값과 mTLS 인증서가 준비되면 `.env.production`을 채운다. 비밀값은 출력하지 않는다.
7. 운영값을 채운 뒤 `npm run build`, `npm run snapshot:release`, `npm run evidence:device:draft -- --force`를 다시 실행해 client placeholder가 들어간 `.ait` 업로드를 막는다.
8. Toss 실제 기기로 QR 테스트를 수행하고 `qa-evidence/screens`에 증거 이미지를 채운다.
9. 앨범 선택은 `fetchAlbumItems`를 쓰므로 실기기 Toss 앱 버전이 5.261.0 이상인지 확인한다.
10. `npm run check:launch`가 통과할 때까지 차단 항목을 하나씩 제거한다.
11. 앱 내부 플로우는 홈/분류/정리/보관/사진 상세 전부 실제 사진 묶음 진입 구조로 확인한다.
12. 상용화 전에는 광고 보상, 구독 권한 부여, pending order 복구, 계정 삭제 플로우를 반드시 실기기에서 확인한다.

## 다음 세션에 그대로 붙여넣을 프롬프트

```text
마스터의 픽토리 앱인토스 프로젝트를 이어서 작업해라.
작업 폴더는 C:\Users\50106\Desktop\pictory 이다.
먼저 AGENTS.md와 NEXT_SESSION_HANDOFF.md를 읽고, git status와 npm run check:release, npm run check:launch 상태를 확인해라.
목표는 픽토리를 Apps in Toss에 실제 등록/업로드하고, 출시 전 차단 항목을 제거하는 것이다.
절대 실제 사진 원본을 외부로 무단 전송하지 말고, 비밀값을 출력하지 말고, 마스터를 항상 "마스터"라고 부르며 한국어로 짧고 정확하게 보고해라.
```
