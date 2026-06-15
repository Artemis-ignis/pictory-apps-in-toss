# Apps in Toss Maker

Codex 없이 새 앱인토스 미니앱 골격을 만들기 위한 로컬 생성기입니다.

## 사용법

```powershell
npm run maker:create -- --name my-photo-helper --title "내 사진 도우미" --dest C:\Users\50106\Desktop\my-photo-helper --photos
```

생성된 폴더에서 실행합니다.

```powershell
npm install
npm run web:dev
npm run build
```

## 생성되는 것

- React + Vite 앱
- `granite.config.ts` 앱인토스 설정
- 사진 권한과 앨범 선택 예시 코드
- 모바일 우선 UI
- `.ait` 빌드 스크립트

## 옵션

- `--name`: 패키지명과 앱 이름에 쓸 영문 슬러그
- `--title`: 화면과 앱인토스 브랜드에 보일 이름
- `--dest`: 생성할 폴더
- `--primary`: 대표 색상, 기본값 `#2F80FF`
- `--photos`: 사진 선택 기능 포함
- `--no-photos`: 사진 기능 없이 생성
- `--force`: 대상 폴더가 비어 있지 않아도 덮어쓰기
