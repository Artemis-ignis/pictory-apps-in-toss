import {
  Archive,
  ArrowLeft,
  Camera,
  Check,
  FileArchive,
  FolderOpen,
  ImageOff,
  Moon,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { BucketCard } from "../components/BucketCard";
import { Mascot } from "../components/Mascot";
import { PhotoTile } from "../components/PhotoTile";
import {
  cleanBucketMatches,
  isCleanTabItem,
} from "../features/album/classifier";
import {
  CLEAN_BUCKETS,
  type ClassifiedItem,
  type CleanBucketId,
} from "../features/album/types";

interface CleanPageProps {
  items: ClassifiedItem[];
  selectedBucket: CleanBucketId | "all";
  queuedCount: number;
  onSelectBucket: (bucket: CleanBucketId | "all") => void;
  onQueue: (id: string) => void;
  onSave: (id: string) => void;
  onIgnore: (id: string) => void;
  onOpenPhoto: (id: string) => void;
  onApplyFolderStatus: (
    ids: string[],
    status: ClassifiedItem["status"],
  ) => void;
}

const icons: Record<CleanBucketId, JSX.Element> = {
  sensitive: <ShieldAlert size={20} />,
  needsReview: <Sparkles size={20} />,
  similar: <ImageOff size={20} />,
  dark: <Moon size={20} />,
  capturePile: <Camera size={20} />,
  keep: <FileArchive size={20} />,
};

export function CleanPage({
  items,
  selectedBucket,
  queuedCount,
  onSelectBucket,
  onQueue,
  onSave,
  onIgnore,
  onOpenPhoto,
  onApplyFolderStatus,
}: CleanPageProps) {
  const candidates = items.filter(isCleanTabItem);
  const buckets = CLEAN_BUCKETS.map((bucket) => ({
    bucket,
    count: candidates.filter((item) => cleanBucketMatches(item, bucket.id))
      .length,
  }));
  const selectedBucketMeta =
    selectedBucket === "all"
      ? null
      : CLEAN_BUCKETS.find((bucket) => bucket.id === selectedBucket);
  const selectedItems =
    selectedBucketMeta == null
      ? []
      : candidates.filter((item) =>
          cleanBucketMatches(item, selectedBucketMeta.id),
        );

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
            <span>후보별</span>
          </button>
          <div className={`folder-icon tone-${selectedBucketMeta.tone}`}>
            {icons[selectedBucketMeta.id] ?? <FolderOpen size={22} />}
          </div>
          <div>
            <p>정리 폴더</p>
            <h1>{selectedBucketMeta.label}</h1>
            <span>{selectedItems.length}장</span>
          </div>
        </section>

        {queuedCount > 0 ? (
          <div className="queue-banner">
            <strong>{queuedCount}장</strong>
            <span>
              정리 후보로 표시했어요. 실제 삭제 전에는 앨범에서 다시 확인해야
              해요.
            </span>
          </div>
        ) : null}

        <div className="folder-action-bar" aria-label="폴더 빠른 처리">
          <button
            type="button"
            className="soft-action"
            disabled={selectedIds.length === 0}
            onClick={() => onApplyFolderStatus(selectedIds, "queued")}
          >
            <Trash2 size={16} />
            <span>정리</span>
          </button>
          <button
            type="button"
            className="soft-action"
            disabled={selectedIds.length === 0}
            onClick={() => onApplyFolderStatus(selectedIds, "saved")}
          >
            <Archive size={16} />
            <span>보관</span>
          </button>
          <button
            type="button"
            className="soft-action"
            disabled={selectedIds.length === 0}
            onClick={() => onApplyFolderStatus(selectedIds, "ignored")}
          >
            <Check size={16} />
            <span>제외</span>
          </button>
        </div>

        {selectedItems.length > 0 ? (
          <section className="photo-list folder-photo-list">
            {selectedItems.map((item) => (
              <PhotoTile
                key={item.id}
                item={item}
                onOpen={onOpenPhoto}
                onQueue={onQueue}
                onSave={onSave}
                onIgnore={onIgnore}
              />
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
      <section className="summary-hero clean-hero">
        <div>
          <p>정리</p>
          <h1>
            지울 후보만
            <br />
            모았어요
          </h1>
          <span>삭제 전 확인만 해요</span>
        </div>
        <Mascot variant="clean" />
      </section>

      <div className="section-heading">
        <h2>후보별</h2>
        <span className="section-count">{candidates.length}장</span>
      </div>

      <section className="bucket-list">
        {buckets.map(({ bucket, count }) => (
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

      {queuedCount > 0 ? (
        <div className="queue-banner">
          <strong>{queuedCount}장</strong>
          <span>
            정리 후보로 표시했어요. 실제 삭제 전에는 앨범에서 다시 확인해야
            해요.
          </span>
        </div>
      ) : null}
    </main>
  );
}
