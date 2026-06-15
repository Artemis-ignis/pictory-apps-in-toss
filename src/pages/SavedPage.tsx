import { Share2, Trash2 } from "lucide-react";
import { Mascot } from "../components/Mascot";
import { PhotoTile } from "../components/PhotoTile";
import type { ClassifiedItem } from "../features/album/types";

interface SavedPageProps {
  savedItems: ClassifiedItem[];
  historyCount: number;
  onClear: () => void;
  onShare: () => void;
}

export function SavedPage({
  savedItems,
  historyCount,
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
        <button type="button">{savedItems.length}장</button>
      </div>

      {savedItems.length > 0 ? (
        <section className="photo-list">
          {savedItems.map((item) => (
            <PhotoTile key={item.id} item={item} compact />
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

      <div className="section-heading">
        <h2>최근 지도 기록</h2>
        <button type="button">{historyCount > 0 ? "2개" : "0개"}</button>
      </div>

      <section className="history-list">
        {historyCount > 0
          ? ["2026. 6. 13.", "2026. 6. 12."].map((date) => (
              <article className="history-card" key={date}>
                <strong>{date}</strong>
                <div>
                  <b>{historyCount}장</b>
                  <span>정리후보 {historyCount}장</span>
                </div>
              </article>
            ))
          : null}
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
