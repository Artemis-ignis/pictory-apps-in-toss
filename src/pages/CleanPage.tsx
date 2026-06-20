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
import { useMemo, useState } from "react";
import { BucketCard } from "../components/BucketCard";
import { BucketPhotoTray } from "../components/BucketPhotoTray";
import { Mascot } from "../components/Mascot";
import { PhotoTile } from "../components/PhotoTile";
import {
  cleanBucketMatches,
  isCleanTabItem,
} from "../features/album/classifier";
import {
  CLEAN_BUCKETS,
  MAP_BUCKETS,
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
  const [reviewFilter, setReviewFilter] = useState<CleanBucketId | "all">(
    "all",
  );
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
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
  const previewCandidates = candidates.slice(0, 12);
  const reviewItems = useMemo(
    () => {
      const filtered =
        reviewFilter === "all"
          ? candidates
          : candidates.filter((item) => cleanBucketMatches(item, reviewFilter));
      return filtered.filter((item) => item.status !== "queued");
    },
    [candidates, reviewFilter],
  );
  const reviewTabs = [
    { id: "all" as const, label: "전체", count: candidates.length },
    {
      id: "similar" as const,
      label: "유사",
      count: candidates.filter((item) => cleanBucketMatches(item, "similar"))
        .length,
    },
    {
      id: "dark" as const,
      label: "흐림",
      count: candidates.filter((item) => cleanBucketMatches(item, "dark"))
        .length,
    },
  ];
  const visibleReviewItems = reviewItems.slice(0, 4);
  const validSelectedReviewIds = selectedReviewIds.filter((id) =>
    candidates.some((item) => item.id === id),
  );

  function toggleReviewItem(id: string) {
    setSelectedReviewIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  function selectVisibleReviewItems() {
    setSelectedReviewIds(visibleReviewItems.map((item) => item.id));
  }

  function queueSelectedReviewItems() {
    if (validSelectedReviewIds.length === 0) {
      return;
    }

    onApplyFolderStatus(validSelectedReviewIds, "queued");
    setSelectedReviewIds([]);
  }

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
            onClick={() => onApplyFolderStatus(selectedIds, "saved")}
          >
            <Archive size={16} />
            <span>보관</span>
          </button>
          <button
            type="button"
            className="soft-action"
            disabled={selectedIds.length === 0}
            onClick={() => onApplyFolderStatus(selectedIds, "queued")}
          >
            <Trash2 size={16} />
            <span>정리 후보</span>
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

      <section className="clean-review-panel" aria-label="선택 정리">
        <div className="clean-filter-tabs">
          {reviewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={reviewFilter === tab.id ? "is-active" : ""}
              onClick={() => setReviewFilter(tab.id)}
            >
              <span>{tab.label}</span>
              <b>{tab.count}</b>
            </button>
          ))}
        </div>

        <div className="clean-selection-bar">
          <span>선택한 항목 {validSelectedReviewIds.length}장</span>
          <button type="button" onClick={selectVisibleReviewItems}>
            보이는 항목 선택
          </button>
        </div>

        {visibleReviewItems.length > 0 ? (
          <div className="clean-review-list">
            {visibleReviewItems.map((item) => {
              const checked = validSelectedReviewIds.includes(item.id);
              return (
                <label className="clean-review-card" key={item.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleReviewItem(item.id)}
                  />
                  <span className="clean-review-thumb">
                    <img src={item.dataUri} alt={item.fileName ?? "사진"} />
                    {item.privacy === "sensitive" ? <em>민감</em> : null}
                  </span>
                  <span className="clean-review-copy">
                    <strong>{getReviewTitle(item)}</strong>
                    <small>{getReviewCaption(item)}</small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="tray-empty">이 조건에는 정리 후보가 없어요.</p>
        )}

        <button
          type="button"
          className="primary-action clean-queue-action"
          disabled={validSelectedReviewIds.length === 0}
          onClick={queueSelectedReviewItems}
        >
          <Trash2 size={18} />
          <span>선택 항목 정리하기 ({validSelectedReviewIds.length})</span>
        </button>
      </section>

      <BucketPhotoTray
        items={previewCandidates}
        title="삭제 전 확인할 사진"
        onQueue={onQueue}
        onSave={onSave}
        onIgnore={onIgnore}
      />

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

function getReviewTitle(item: ClassifiedItem) {
  if (item.privacy === "sensitive" || item.cleanBucketId === "sensitive") {
    return "민감정보 후보";
  }

  return `${getCategoryLabel(item)} 사진`;
}

function getReviewCaption(item: ClassifiedItem) {
  const bucket = CLEAN_BUCKETS.find(
    (candidate) => candidate.id === item.cleanBucketId,
  );
  return [item.periodLabel, bucket?.label].filter(Boolean).join(" · ");
}

function getCategoryLabel(item: ClassifiedItem) {
  return (
    MAP_BUCKETS.find((bucket) => bucket.id === item.categoryId)?.shortLabel ??
    "사진"
  );
}
