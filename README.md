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

## 구현 범위

- Apps in Toss `photos` 권한과 `fetchAlbumPhotos`/`fetchAlbumItems` 연결
- 브라우저 개발 환경용 실제 이미지 파일 선택
- 캔버스 기반 이미지 신호 분석과 종류/정리 후보 분류
- 홈, 지도, 정리, 보관 4개 화면
- 보상형 광고 연결부와 브라우저 fallback
- 민감정보 후보 흐림 처리와 로컬 저장 상태 관리

## 운영 전 확인해야 할 것

- 실제 토스 앱 또는 콘솔 QR 테스트에서 사진 권한 요청과 앨범 읽기 확인
- 운영 광고 그룹 ID 적용 후 `userEarnedReward` 이벤트 발생 시에만 스캔권 지급되는지 확인
- 광고 미지원/닫기/실패 상태에서 스캔권이 지급되지 않는지 확인
- `pictory.ait` 최신 빌드 업로드 전 `npm run test && npm run typecheck && npm run lint && npm run build` 재실행
