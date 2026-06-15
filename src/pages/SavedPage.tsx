import {
  Archive,
  ArrowLeft,
  Camera,
  FileText,
  FolderOpen,
  Heart,
  MapPin,
  ReceiptText,
  Share2,
  Soup,
  Trash2,
  UserRound,
} from "lucide-react";
import { BucketCard } from "../components/BucketCard";
import { Mascot } from "../components/Mascot";
import { PhotoTile } from "../components/PhotoTile";
import {
  MAP_BUCKETS,
  type ClassifiedItem,
  type MapBucketId,
  type ScanHistoryEntry,
} from "../features/album/types";
import type { UsagePlan } from "../features/billing/plans";

interface SavedPageProps {
  savedItems: ClassifiedItem[];
  historyEntries: ScanHistoryEntry[];
  plan: UsagePlan;
  selectedBucket: MapBucketId | "all";
  onSelectBucket: (bucket: MapBucketId | "all") => void;
  onUnsave: (ids: string[]) => void;
  onClear: () => void;
  onShare: () => void;
}

const icons: Record<MapBucketId, JSX.Element> = {
  capture: <Camera size={20} />,
  document: <FileText size={20} />,
  receipt: <ReceiptText size={20} />,
  food: <Soup size={20} />,
  place: <MapPin size={20} />,
  people: <UserRound size={20} />,
  coupon: <ReceiptText size={20} />,
  memory: <Heart size={20} />,
};

export function SavedPage({
  savedItems,
  historyEntries,
  plan,
  selectedBucket,
  onSelectBucket,
  onUnsave,
  onClear,
  onShare,
}: SavedPageProps) {
  const savedBuckets = MAP_BUCKETS.map((bucket) => ({
    bucket,
    count: savedItems.filter((item) => item.categoryId === bucket.id).length,
  })).filter(({ count }) => count > 0);
  const selectedBucketMeta =
    selectedBucket === "all"
      ? null
      : MAP_BUCKETS.find((bucket) => bucket.id === selectedBucket);
  const selectedItems =
    selectedBucketMeta == null
      ? []
      : savedItems.filter((item) => item.categoryId === selectedBucketMeta.id);

  if (selectedBucketMeta != null) {
    const selectedIds = selectedItems.map((item) => item.id);

    return (
      <main className="screen folder-screen">
        <section className="folder-header">
          <button
            type="button"
            className="folder-back"
            onClick={() => onSelectBucket("all")}
          >
            <ArrowLeft size={19} />
            <span>보관함</span>
          </button>
          <div className={`folder-icon tone-${selectedBucketMeta.tone}`}>
            {icons[selectedBucketMeta.id] ?? <FolderOpen size={22} />}
          </div>
          <div>
            <p>보관 폴더</p>
            <h1>{selectedBucketMeta.label}</h1>
            <span>{selectedItems.length}장</span>
          </div>
        </section>

        <div
          className="folder-action-bar is-single"
          aria-label="보관 폴더 빠른 처리"
        >
          <button
            type="button"
            className="soft-action"
            disabled={selectedIds.length === 0}
            onClick={() => onUnsave(selectedIds)}
          >
            <Archive size={16} />
            <span>해제</span>
          </button>
        </div>

        {selectedItems.length > 0 ? (
          <section className="photo-list folder-photo-list">
            {selectedItems.map((item) => (
              <PhotoTile key={item.id} item={item} compact />
            ))}
          </section>
        ) : (
          <section className="empty-mini">
            <FolderOpen size={24} />
            <div>
              <strong>아직 사진이 없어요</strong>
              <span>다른 폴더를 열어보세요.</span>
            </div>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="summary-hero saved-hero">
        <div>
          <p>보관</p>
          <h1>다시 볼 것만 보관</h1>
          <span>지도 기록도 같이 저장</span>
        </div>
        <Mascot variant="saved" />
      </section>

      <div className="section-heading">
        <h2>보관 폴더</h2>
        <span className="section-count">
          {savedItems.length}/{plan.storageLimit}장
        </span>
      </div>

      {savedItems.length > 0 ? (
        <section className="bucket-list">
          {savedBuckets.map(({ bucket, count }) => (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              count={count}
              icon={icons[bucket.id]}
              extraCount={Math.max(0, count - 3)}
              onClick={() => onSelectBucket(bucket.id)}
            />
          ))}
        </section>
      ) : (
        <section className="saved-empty">
          <Mascot variant="saved" size="empty" />
          <div>
            <strong>아직 보관함이 비었어요</strong>
            <span>지도에서 사진을 눌러 보관하세요.</span>
          </div>
        </section>
      )}

      {savedItems.length > 0 ? (
        <>
          <div className="section-heading">
            <h2>최근 보관</h2>
            <span className="section-count">{savedItems.length}장</span>
          </div>
          <section className="photo-list">
            {savedItems.slice(0, 4).map((item) => (
              <PhotoTile key={item.id} item={item} compact />
            ))}
          </section>
        </>
      ) : null}

      <div className="section-heading">
        <h2>최근 지도 기록</h2>
        <span className="section-count">{historyEntries.length}개</span>
      </div>

      <section className="history-list">
        {historyEntries.map((entry) => (
          <article className="history-card" key={entry.id}>
            <strong>{formatHistoryDate(entry.scannedAt)}</strong>
            <div>
              <b>{entry.totalCount}장</b>
              <span>정리후보 {entry.cleanCandidateCount}장</span>
            </div>
          </article>
        ))}
        {historyEntries.length === 0 ? (
          <article className="history-card history-empty">
            <strong>기록 없음</strong>
            <div>
              <b>0장</b>
              <span>지도 만들기 전</span>
            </div>
          </article>
        ) : null}
      </section>

      <div className="saved-actions">
        <button type="button" className="soft-action" onClick={onShare}>
          <Share2 size={18} />
          <span>앨범 요약 공유하기</span>
        </button>
        <button type="button" className="danger-action" onClick={onClear}>
          <Trash2 size={18} />
          <span>픽토리 데이터 삭제</span>
        </button>
      </div>
    </main>
  );
}

function formatHistoryDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "날짜 없음";
  }

  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}
