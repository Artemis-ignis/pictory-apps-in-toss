import { Archive, Check, Trash2 } from "lucide-react";
import type { ClassifiedItem } from "../features/album/types";

interface PhotoTileProps {
  item: ClassifiedItem;
  compact?: boolean;
  onQueue?: (id: string) => void;
  onSave?: (id: string) => void;
  onIgnore?: (id: string) => void;
}

export function PhotoTile({
  item,
  compact = false,
  onQueue,
  onSave,
  onIgnore,
}: PhotoTileProps) {
  const protectedPreview =
    item.privacy !== "normal" ||
    item.cleanBucketId === "sensitive" ||
    item.cleanBucketId === "needsReview" ||
    item.categoryId === "receipt" ||
    item.categoryId === "document" ||
    item.categoryId === "coupon";
  const maskLabel =
    item.privacy === "sensitive" || item.cleanBucketId === "sensitive"
      ? "민감"
      : "확인";
  const statusLabel = getStatusLabel(item.status);

  return (
    <article
      className={`photo-tile is-${item.status} ${compact ? "is-compact" : ""}`}
    >
      <div className={`photo-frame ${protectedPreview ? "is-sensitive" : ""}`}>
        {item.dataUri ? (
          <img src={item.dataUri} alt={item.fileName ?? "사진"} />
        ) : null}
        {protectedPreview ? (
          <span className="sensitive-mask">{maskLabel}</span>
        ) : null}
      </div>
      <div className="photo-info">
        <div className="photo-title-row">
          <strong>
            {item.fileName?.replace(/^sample-/, "") ?? item.categoryId}
          </strong>
          {statusLabel ? <em>{statusLabel}</em> : null}
        </div>
        <span>{item.reasons.join(" · ")}</span>
      </div>
      {!compact ? (
        <div className="photo-actions">
          <button
            type="button"
            onClick={() => onSave?.(item.id)}
            aria-label="보관"
            aria-pressed={item.status === "saved"}
            className={item.status === "saved" ? "is-active" : ""}
          >
            <Archive size={16} />
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
          <button
            type="button"
            onClick={() => onQueue?.(item.id)}
            aria-label="정리 후보"
            aria-pressed={item.status === "queued"}
            className={item.status === "queued" ? "is-active" : ""}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function getStatusLabel(status: ClassifiedItem["status"]) {
  if (status === "saved") {
    return "보관";
  }
  if (status === "queued") {
    return "정리";
  }
  if (status === "ignored") {
    return "제외";
  }
  return "";
}
