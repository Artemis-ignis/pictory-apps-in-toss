# 픽토리 앱 내 기능 등록안

앱인토스 문서 기준으로 비게임 앱은 앱 내 기능을 최소 1개 이상 등록해야 한다.
픽토리는 콘솔 검토 반려를 줄이기 위해 홈/묶음/선별/킵 주요 진입점을 모두
`intoss://pictory/?tab=...` 형식으로 준비한다.

| 한국어 기능 이름 | 영어 기능 이름 | 이동 URL | 진입 화면 |
| --- | --- | --- | --- |
| 베스트컷찾기 | Find best shots | `intoss://pictory/?tab=home` | 홈 |
| 사진묶음보기 | View groups | `intoss://pictory/?tab=map` | 묶음 |
| 올릴컷고르기 | Pick cuts | `intoss://pictory/?tab=clean` | 선별 |
| 킵앨범열기 | Open keep | `intoss://pictory/?tab=saved` | 킵 |

## 콘솔 입력 기준

- 한국어 기능 이름은 10자 이내로 유지한다.
- 영어 기능 이름은 15자 이내, 첫 글자는 대문자로 유지한다.
- 기능명은 단순한 "보기"가 아니라 픽토리 기능이 드러나게 쓴다.
- 실제 검토 전 `npm run qa:flow`, `npm run qa:flow:built`,
  `npm run check:release`로 각 URL 진입이 화면 QA에 포함됐는지 확인한다.

근거 문서: https://developers-apps-in-toss.toss.im/development/test/function.md
