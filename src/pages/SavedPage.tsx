import { Share2, Trash2 } from "lucide-react";
import { BucketPhotoTray } from "../components/BucketPhotoTray";
import { Mascot } from "../components/Mascot";
import { PhotoTile } from "../components/PhotoTile";
import type { ClassifiedItem, ScanHistoryEntry } from "../features/album/types";
import type { UsagePlan } from "../features/billing/plans";

interface SavedPageProps {
  savedItems: ClassifiedItem[];
  historyEntries: ScanHistoryEntry[];
  plan: UsagePlan;
  onClear: () => void;
  onShare: () => void;
}

export function SavedPage({
  savedItems,
  historyEntries,
  plan,
  onClear,
  onShare,
}: SavedPageProps) {
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
        <h2>보관한 사진</h2>
        <button type="button">
          {savedItems.length}/{plan.storageLimit}장
        </button>
      </div>

      {savedItems.length > 0 ? (
        <>
          <BucketPhotoTray items={savedItems} title="보관함" />
          <section className="photo-list">
            {savedItems.map((item) => (
              <PhotoTile key={item.id} item={item} compact />
            ))}
          </section>
        </>
      ) : (
        <section className="saved-empty">
          <Mascot variant="saved" size="empty" />
          <div>
            <strong>아직 보관함이 비었어요</strong>
            <span>지도에서 사진을 눌러 보관하세요.</span>
          </div>
        </section>
      )}

      <div className="section-heading">
        <h2>최근 지도 기록</h2>
        <button type="button">{historyEntries.length}개</button>
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
