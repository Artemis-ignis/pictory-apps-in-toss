import type { AlbumItem, ImageSignals } from "../features/album/types";

const now = new Date("2026-06-15T09:00:00+09:00");

export const sampleAlbumItems: AlbumItem[] = [
  createSample("receipt-cafe", "영수증", "카페 결제", "#E9FAFF", "#27C5D8", [
    "receipt",
    "결제",
    "영수증",
  ]),
  createSample("capture-bank", "캡처", "송금 확인", "#F0F5FF", "#2F80FF", [
    "screenshot",
    "송금",
    "계좌",
  ]),
  createSample("document-contract", "문서", "계약 메모", "#F7F8FB", "#8A95A8", [
    "document",
    "계약",
    "문서",
  ]),
  createSample("food-menu", "음식", "저녁 메뉴", "#FFF4E7", "#FF9F2F", [
    "food",
    "menu",
    "음식",
  ]),
  createSample("place-trip", "장소", "주말 산책", "#EFFFF5", "#41C88A", [
    "travel",
    "place",
    "풍경",
  ]),
  createSample("people-friends", "사람", "친구 사진", "#F1F6FF", "#6A9BFF", [
    "people",
    "portrait",
  ]),
  createSample("sensitive-id", "민감", "신분증 가림", "#EEF6FF", "#2F80FF", [
    "주민등록",
    "신분증",
    "sensitive",
  ]),
  createSample("capture-coupon", "쿠폰", "마감 임박", "#FFF2F5", "#FF5B78", [
    "coupon",
    "barcode",
    "screenshot",
  ]),
  createSample("dark-room", "어두움", "흐린 사진", "#1D2430", "#41C88A", [
    "dark",
    "low light",
    "memory",
  ]),
  createSample("document-note", "문서", "수납 기록", "#F7F8FB", "#6F7B90", [
    "document",
    "record",
  ]),
  createSample("memory-trip-copy", "기록", "여행 기록", "#F7F8FB", "#8A95A8", [
    "memory",
    "note",
    "duplicate",
    "기록",
  ]),
  createSample("coupon-market", "쿠폰", "마트 쿠폰", "#FFF2F5", "#FF5B78", [
    "coupon",
    "barcode",
    "마감",
  ]),
  createSample("food-brunch", "음식", "브런치", "#FFF4E7", "#FF9F2F", [
    "food",
    "음식",
  ]),
  createSample("food-dessert", "음식", "디저트", "#FFF4E7", "#FF9F2F", [
    "food",
    "카페",
  ]),
  createSample("food-dinner", "음식", "저녁 기록", "#FFF4E7", "#FF9F2F", [
    "food",
    "menu",
  ]),
  createSample("food-market", "음식", "장보기", "#FFF4E7", "#FF9F2F", [
    "food",
    "마트",
  ]),
  createSample("capture-chat", "캡처", "대화 저장", "#F0F5FF", "#2F80FF", [
    "screenshot",
    "chat",
    "캡처",
  ]),
  createSample("capture-ticket", "캡처", "예매 화면", "#F0F5FF", "#2F80FF", [
    "screenshot",
    "ticket",
    "캡처",
  ]),
  createSample("people-family", "사람", "가족 사진", "#F1F6FF", "#6A9BFF", [
    "people",
    "portrait",
  ]),
  createSample("memory-daily", "기록", "일상 메모", "#F7F8FB", "#8A95A8", [
    "memory",
    "note",
    "일상",
    "기록",
  ]),
];

function createSample(
  id: string,
  label: string,
  title: string,
  background: string,
  accent: string,
  hints: string[],
): AlbumItem {
  const offset = sampleAlbumItemsLengthGuess(id);
  const createdAt = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
  const lowLight = hints.includes("dark");
  const documentLike =
    hints.includes("document") ||
    hints.includes("receipt") ||
    hints.includes("screenshot") ||
    hints.includes("coupon") ||
    hints.includes("memory");

  return {
    id: `sample-${id}`,
    type: "PHOTO",
    source: "sample",
    createdAt: createdAt.toISOString(),
    fileName: `${id}.png`,
    hints,
    dataUri: makeSvgDataUri(label, title, background, accent, documentLike),
    signals: sampleSignals({
      lowLight,
      documentLike,
      portrait: hints.includes("people"),
      duplicate: hints.includes("duplicate"),
    }),
  };
}

function sampleAlbumItemsLengthGuess(id: string) {
  return (
    Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 100
  );
}

function makeSvgDataUri(
  label: string,
  title: string,
  background: string,
  accent: string,
  documentLike: boolean,
) {
  const lines = documentLike
    ? `<rect x="18" y="64" width="124" height="7" rx="3.5" fill="#C9D6EA"/>
       <rect x="18" y="82" width="92" height="7" rx="3.5" fill="#DDE6F4"/>
       <rect x="18" y="100" width="110" height="7" rx="3.5" fill="#DDE6F4"/>`
    : `<circle cx="46" cy="72" r="20" fill="${accent}" opacity=".9"/>
       <path d="M18 116L64 76L94 104L114 88L142 116H18Z" fill="${accent}" opacity=".35"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="28" fill="${background}"/>
    <rect x="16" y="16" width="128" height="128" rx="18" fill="white" opacity=".72"/>
    <rect x="18" y="24" width="62" height="22" rx="11" fill="${accent}"/>
    <text x="30" y="40" font-size="13" font-weight="800" fill="white">${label}</text>
    ${lines}
    <text x="20" y="136" font-size="15" font-weight="800" fill="#071735">${title}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function sampleSignals(options: {
  lowLight: boolean;
  documentLike: boolean;
  portrait: boolean;
  duplicate: boolean;
}): ImageSignals {
  if (options.lowLight) {
    return {
      width: 160,
      height: 160,
      aspectRatio: 1,
      brightness: 0.16,
      saturation: 0.28,
      edgeDensity: 0.18,
      textLineScore: 0.04,
      colorVariance: 0.18,
      perceptualHash:
        "0000111100001111000011110000111100001111000011110000111100001111",
    };
  }

  if (options.documentLike) {
    return {
      width: 160,
      height: 160,
      aspectRatio: 1,
      brightness: 0.84,
      saturation: 0.16,
      edgeDensity: 0.31,
      textLineScore: 0.34,
      colorVariance: 0.12,
      perceptualHash: options.duplicate
        ? "1111000011110000111100001111000011110000111100001111000011110000"
        : "1111110011111100111111001111110011111100111111001111110011111100",
    };
  }

  return {
    width: 160,
    height: 160,
    aspectRatio: 1,
    brightness: 0.68,
    saturation: options.portrait ? 0.42 : 0.55,
    edgeDensity: 0.17,
    textLineScore: 0.05,
    colorVariance: 0.42,
    perceptualHash: options.duplicate
      ? "1010101010101010101010101010101010101010101010101010101010101010"
      : "1010100010101000101010001010100010101000101010001010100010101000",
  };
}
