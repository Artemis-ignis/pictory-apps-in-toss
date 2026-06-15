import {
  Archive,
  ArrowLeft,
  Check,
  FileText,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  CLEAN_BUCKETS,
  MAP_BUCKETS,
  type ClassifiedItem,
} from "../features/album/types";

interface PhotoDetailPageProps {
  item: ClassifiedItem;
  onBack: () => void;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onQueue: (id: string) => void;
  onIgnore: (id: string) => void;
}

export function PhotoDetailPage({
  item,
  onBack,
  onSave,
  onUnsave,
  onQueue,
  onIgnore,
}: PhotoDetailPageProps) {
  const protectedPreview = shouldProtectPreview(item);
  const category = MAP_BUCKETS.find((bucket) => bucket.id === item.categoryId);
  const cleanBucket = CLEAN_BUCKETS.find(
    (bucket) => bucket.id === item.cleanBucketId,
  );
  const isSaved = item.status === "saved";

  return (
    <main className="screen photo-detail-screen">
      <section className="detail-header">
        <button type="button" className="folder-back" onClick={onBack}>
          <ArrowLeft size={19} />
          <span>사진</span>
        </button>
        <div>
          <p>검수</p>
          <h1>{item.fileName?.replace(/^sample-/, "") ?? "사진"}</h1>
          <span>{item.periodLabel}</span>
        </div>
      </section>

      <section
        className={`detail-preview ${protectedPreview ? "is-protected" : ""}`}
      >
        {item.dataUri ? (
          <img src={item.dataUri} alt={item.fileName ?? "사진"} />
        ) : (
          <FileText size={44} />
        )}
        {protectedPreview ? (
          <div className="detail-mask">
            <ShieldAlert size={24} />
            <strong>{item.privacy === "sensitive" ? "민감" : "확인"}</strong>
            <span>원본은 저장하지 않아요</span>
          </div>
        ) : null}
      </section>

      <section className="detail-status-grid">
        <article>
          <span>종류</span>
          <strong>{category?.label ?? item.categoryId}</strong>
        </article>
        <article>
          <span>정리</span>
          <strong>{cleanBucket?.shortLabel ?? item.cleanBucketId}</strong>
        </article>
        <article>
          <span>신뢰도</span>
          <strong>{Math.round(item.confidence * 100)}%</strong>
        </article>
      </section>

      <section className="detail-reasons">
        <h2>분류 근거</h2>
        <div>
          {item.reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      </section>

      <section className="detail-actions" aria-label="사진 처리">
        <button
          type="button"
          className={isSaved ? "is-active" : ""}
          onClick={() => (isSaved ? onUnsave(item.id) : onSave(item.id))}
        >
          <Archive size={18} />
          <span>{isSaved ? "해제" : "보관"}</span>
        </button>
        <button
          type="button"
          className={item.status === "queued" ? "is-active" : ""}
          onClick={() => onQueue(item.id)}
        >
          <Trash2 size={18} />
          <span>정리</span>
        </button>
        <button
          type="button"
          className={item.status === "ignored" ? "is-active" : ""}
          onClick={() => onIgnore(item.id)}
        >
          <Check size={18} />
          <span>제외</span>
        </button>
      </section>
    </main>
  );
}

function shouldProtectPreview(item: ClassifiedItem) {
  return (
    item.privacy !== "normal" ||
    item.cleanBucketId === "sensitive" ||
    item.cleanBucketId === "needsReview" ||
    item.categoryId === "receipt" ||
    item.categoryId === "document" ||
    item.categoryId === "coupon"
  );
}
