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
npm run build
```

`npm run build`는 `pictory.ait`를 생성합니다.

## 운영 설정

보상형 광고는 기본값으로 앱인토스 테스트 광고 ID를 사용합니다.

```bash
cp .env.example .env
```

출시 빌드에서는 앱인토스 콘솔에서 발급받은 보상형 광고 그룹 ID를 `.env`에 넣어야 합니다.

```bash
VITE_TOSS_REWARDED_AD_GROUP_ID=콘솔에서_발급받은_보상형_광고_ID
```

개발 단계에서는 반드시 테스트 ID(`ait-ad-test-rewarded-id`)를 사용합니다. 실제 광고 ID로 개발 테스트를 반복하면 광고 정책 위반으로 간주될 수 있습니다.

앱인토스 QR 테스트, 광고 운영, 서버 AI 분류 API 계약은 `docs/apps-in-toss-test-and-monetization.md`를 기준으로 확인합니다.

## 구현 범위

- Apps in Toss `photos` 권한과 `fetchAlbumPhotos`/`fetchAlbumItems` 연결
- 브라우저 개발 환경용 실제 이미지 파일 선택
- 캔버스 기반 이미지 신호 분석과 종류/정리 후보 분류
- 운영 서버 AI 분류 endpoint 연결부
- 홈, 지도, 정리, 보관 4개 화면
- 보상형 광고 연결부와 브라우저 fallback
- 민감정보 후보 흐림 처리와 로컬 저장 상태 관리
- 앱 재실행 후에도 최근 분류 지도, 보관 항목, 스캔 기록 복원

## 앨범 fallback 정책

- 로컬 개발환경(`localhost`, `127.0.0.1`, Vite dev)에서만 샘플 앨범과 브라우저 파일 선택 fallback을 사용합니다.
- 운영/토스 앱 환경에서 앨범 권한, 토스 앱 버전, 네이티브 API 문제가 생기면 샘플 데이터로 덮지 않고 사용자에게 실패 상태를 보여줍니다.
- `fetchAlbumItems`에서 사용자가 선택을 취소하면 빈 배열로 처리하고, 실패로 간주하지 않습니다.

## 개인정보 저장 방식

- 원본 사진은 저장하지 않습니다.
- 최근 분류 결과는 앱 안의 로컬 저장소에 작은 썸네일과 분류 메타데이터만 보관합니다.
- 민감정보 후보는 실제 이미지 썸네일 대신 차단용 대체 이미지를 저장합니다.
- `픽토리 데이터 삭제`를 누르면 저장된 보관 상태, 정리 후보, 최근 분류 결과, 스캔 기록을 모두 삭제합니다.
- 운영 환경에서는 로컬 저장소의 유료 플랜 값을 실제 권한으로 믿지 않습니다. 인앱결제 지급·복원·주문 상태 검증이 붙기 전까지 Plus/Pro는 로컬 개발 미리보기에서만 한도로 적용됩니다.

## 운영 전 확인해야 할 것

- 실제 토스 앱 또는 콘솔 QR 테스트에서 사진 권한 요청과 앨범 읽기 확인
- 운영 광고 그룹 ID 적용 후 `userEarnedReward` 이벤트 발생 시에만 스캔권 지급되는지 확인
- 광고 미지원/닫기/실패 상태에서 스캔권이 지급되지 않는지 확인
- `pictory.ait` 최신 빌드 업로드 전 `npm run test && npm run typecheck && npm run lint && npm run build` 재실행
