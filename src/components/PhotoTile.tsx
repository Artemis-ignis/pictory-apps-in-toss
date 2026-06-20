import { Archive, Check, Trash2 } from "lucide-react";
import {
  CLEAN_BUCKETS,
  MAP_BUCKETS,
  type ClassifiedItem,
} from "../features/album/types";

interface PhotoTileProps {
  item: ClassifiedItem;
  compact?: boolean;
  onOpen?: (id: string) => void;
  onQueue?: (id: string) => void;
  onSave?: (id: string) => void;
  onIgnore?: (id: string) => void;
}

export function PhotoTile({
  item,
  compact = false,
  onOpen,
  onQueue,
  onSave,
  onIgnore,
}: PhotoTileProps) {
  const protectedPreview =
    item.privacy === "sensitive" || item.cleanBucketId === "sensitive";
  const statusLabel = getStatusLabel(item.status);
  const title = getPhotoTitle(item);
  const subtitle = getPhotoSubtitle(item);

  return (
    <article
      className={`photo-tile is-${item.status} ${compact ? "is-compact" : ""}`}
    >
      <button
        type="button"
        className="photo-open"
        onClick={() => onOpen?.(item.id)}
        aria-label={`${item.fileName ?? "사진"} 상세 보기`}
      >
        <div
          className={`photo-frame ${protectedPreview ? "is-sensitive" : ""}`}
        >
          {item.dataUri ? (
            <img src={item.dataUri} alt={item.fileName ?? "사진"} />
          ) : null}
          {protectedPreview ? (
            <span className="sensitive-mask">민감</span>
          ) : null}
        </div>
        <div className="photo-info">
          <div className="photo-title-row">
            <strong>{title}</strong>
            {statusLabel ? <em>{statusLabel}</em> : null}
          </div>
          <span>{subtitle}</span>
        </div>
      </button>
      {!compact ? (
        <div className="photo-actions">
          <button
            type="button"
            onClick={() => onSave?.(item.id)}
            aria-label="킵"
            aria-pressed={item.status === "saved"}
            className={item.status === "saved" ? "is-active" : ""}
          >
            <Archive size={16} />
          </button>
          <button
            type="button"
            onClick={() => onQueue?.(item.id)}
            aria-label="제외 후보"
            aria-pressed={item.status === "queued"}
            className={item.status === "queued" ? "is-active" : ""}
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => onIgnore?.(item.id)}
            aria-label="제외"
            aria-pressed={item.status === "ignored"}
            className={item.status === "ignored" ? "is-active" : ""}
          >
            <Check size={16} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function getPhotoTitle(item: ClassifiedItem) {
  const category = MAP_BUCKETS.find((bucket) => bucket.id === item.categoryId);
  const cleanBucket = CLEAN_BUCKETS.find(
    (bucket) => bucket.id === item.cleanBucketId,
  );

  if (item.privacy === "sensitive" || item.cleanBucketId === "sensitive") {
    return "민감정보 후보";
  }

  return cleanBucket?.id === "needsReview"
    ? `${category?.shortLabel ?? "사진"} 확인 필요`
    : `${category?.shortLabel ?? "사진"} 컷`;
}

function getPhotoSubtitle(item: ClassifiedItem) {
  const cleanBucket = CLEAN_BUCKETS.find(
    (bucket) => bucket.id === item.cleanBucketId,
  );
  return [item.periodLabel, cleanBucket?.label].filter(Boolean).join(" · ");
}

function getStatusLabel(status: ClassifiedItem["status"]) {
  if (status === "saved") {
    return "킵";
  }
  if (status === "queued") {
    return "제외";
  }
  if (status === "ignored") {
    return "숨김";
  }
  return "";
}
