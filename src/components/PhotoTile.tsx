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
  const sensitive = item.privacy === "sensitive";

  return (
    <article className={`photo-tile ${compact ? "is-compact" : ""}`}>
      <div className={`photo-frame ${sensitive ? "is-sensitive" : ""}`}>
        {item.dataUri ? (
          <img src={item.dataUri} alt={item.fileName ?? "사진"} />
        ) : null}
        {sensitive ? <span className="sensitive-mask">민감</span> : null}
      </div>
      <div className="photo-info">
        <strong>
          {item.fileName?.replace(/^sample-/, "") ?? item.categoryId}
        </strong>
        <span>{item.reasons.join(" · ")}</span>
      </div>
      {!compact ? (
        <div className="photo-actions">
          <button
            type="button"
            onClick={() => onSave?.(item.id)}
            aria-label="보관"
          >
            <Archive size={16} />
          </button>
          <button
            type="button"
            onClick={() => onIgnore?.(item.id)}
            aria-label="제외"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={() => onQueue?.(item.id)}
            aria-label="정리 후보"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </article>
  );
}
