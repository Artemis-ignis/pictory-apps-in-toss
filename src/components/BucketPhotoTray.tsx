import { Archive, Check, Trash2 } from "lucide-react";
import { MAP_BUCKETS, type ClassifiedItem } from "../features/album/types";

interface BucketPhotoTrayProps {
  items: ClassifiedItem[];
  title: string;
  onQueue?: (id: string) => void;
  onSave?: (id: string) => void;
  onIgnore?: (id: string) => void;
}

export function BucketPhotoTray({
  items,
  title,
  onQueue,
  onSave,
  onIgnore,
}: BucketPhotoTrayProps) {
  const previewItems = items.slice(0, 12);

  return (
    <div className="bucket-photo-tray">
      <div className="tray-heading">
        <strong>{title}</strong>
        <span>{items.length}장</span>
      </div>
      {previewItems.length > 0 ? (
        <div className="tray-scroller">
          {previewItems.map((item) => (
            <article className="tray-photo" key={item.id}>
              <div className="tray-frame">
                {item.dataUri ? (
                  <img src={item.dataUri} alt={item.fileName} />
                ) : null}
                {item.privacy === "sensitive" ? <em>민감</em> : null}
              </div>
              <span>{getTrayLabel(item)}</span>
              {onSave || onIgnore || onQueue ? (
                <div className="tray-actions">
                  {onSave ? (
                    <button
                      type="button"
                      aria-label="보관"
                      onClick={() => onSave(item.id)}
                    >
                      <Archive size={13} />
                    </button>
                  ) : null}
                  {onIgnore ? (
                    <button
                      type="button"
                      aria-label="제외"
                      onClick={() => onIgnore(item.id)}
                    >
                      <Check size={13} />
                    </button>
                  ) : null}
                  {onQueue ? (
                    <button
                      type="button"
                      aria-label="정리 후보"
                      onClick={() => onQueue(item.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="tray-empty">이 묶음에는 아직 사진이 없어요.</p>
      )}
    </div>
  );
}

function getTrayLabel(item: ClassifiedItem) {
  return (
    MAP_BUCKETS.find((bucket) => bucket.id === item.categoryId)?.shortLabel ??
    "사진"
  );
}
