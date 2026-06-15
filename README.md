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

## 구현 범위

- Apps in Toss `photos` 권한과 `fetchAlbumPhotos`/`fetchAlbumItems` 연결
- 브라우저 개발 환경용 실제 이미지 파일 선택
- 캔버스 기반 이미지 신호 분석과 종류/정리 후보 분류
- 홈, 지도, 정리, 보관 4개 화면
- 보상형 광고 연결부와 브라우저 fallback
- 민감정보 후보 흐림 처리와 로컬 저장 상태 관리
