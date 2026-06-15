import {
  ArrowLeft,
  Archive,
  CalendarDays,
  Camera,
  Check,
  FileText,
  FolderOpen,
  Heart,
  MapPin,
  ReceiptText,
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
  type MapFolderId,
  type MapBucketId,
} from "../features/album/types";

interface MapPageProps {
  items: ClassifiedItem[];
  selectedFolder: MapFolderId | "all";
  viewMode: "category" | "period";
  onSelectFolder: (folder: MapFolderId | "all") => void;
  onViewModeChange: (viewMode: "category" | "period") => void;
  onSave: (id: string) => void;
  onQueue: (id: string) => void;
  onIgnore: (id: string) => void;
  onOpenPhoto: (id: string) => void;
  onApplyFolderStatus: (
    ids: string[],
    status: ClassifiedItem["status"],
  ) => void;
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

export function MapPage({
  items,
  selectedFolder,
  viewMode,
  onSelectFolder,
  onViewModeChange,
  onSave,
  onQueue,
  onIgnore,
  onOpenPhoto,
  onApplyFolderStatus,
}: MapPageProps) {
  const categoryFolders = MAP_BUCKETS.map((bucket) => ({
    id: `category:${bucket.id}` as const,
    label: bucket.label,
    shortLabel: bucket.shortLabel,
    caption: "종류 폴더",
    tone: bucket.tone,
    icon: icons[bucket.id] ?? <FolderOpen size={22} />,
    count: items.filter((item) => item.categoryId === bucket.id).length,
    items: items.filter((item) => item.categoryId === bucket.id),
  }));
  const periodFolders = getPeriodFolders(items);
  const selectedCategoryFolder = categoryFolders.find(
    (folder) => folder.id === selectedFolder,
  );
  const selectedPeriodFolder = periodFolders.find(
    (folder) => folder.id === selectedFolder,
  );
  const selectedFolderMeta = selectedCategoryFolder ?? selectedPeriodFolder;

  if (selectedFolderMeta != null) {
    const selectedIds = selectedFolderMeta.items.map((item) => item.id);

    return (
      <main className="screen folder-screen">
        <section className="folder-header">
          <button
            type="button"
            className="folder-back"
            onClick={() => onSelectFolder("all")}
          >
            <ArrowLeft size={19} />
            <span>{selectedCategoryFolder != null ? "종류별" : "기간별"}</span>
          </button>
          <div className={`folder-icon tone-${selectedFolderMeta.tone}`}>
            {selectedFolderMeta.icon}
          </div>
          <div>
            <p>{selectedFolderMeta.caption}</p>
            <h1>{selectedFolderMeta.label}</h1>
            <span>{selectedFolderMeta.items.length}장</span>
          </div>
        </section>

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
            <span>정리</span>
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

        {selectedFolderMeta.items.length > 0 ? (
          <section className="photo-list folder-photo-list">
            {selectedFolderMeta.items.map((item) => (
              <PhotoTile
                key={item.id}
                item={item}
                onOpen={onOpenPhoto}
                onSave={onSave}
                onQueue={onQueue}
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
      <section className="summary-hero map-hero">
        <div>
          <p>지도</p>
          <h1>종류와 기간으로</h1>
          <span>
            {items.length}장 ·{" "}
            {categoryFolders.filter(({ count }) => count > 0).length}개 종류
          </span>
        </div>
        <Mascot variant="map" />
      </section>

      <div className="folder-mode-tabs" aria-label="지도 보기 방식">
        <button
          type="button"
          className={viewMode === "category" ? "is-active" : ""}
          aria-pressed={viewMode === "category"}
          onClick={() => onViewModeChange("category")}
        >
          종류별
        </button>
        <button
          type="button"
          className={viewMode === "period" ? "is-active" : ""}
          aria-pressed={viewMode === "period"}
          onClick={() => onViewModeChange("period")}
        >
          기간별
        </button>
      </div>

      {viewMode === "category" ? (
        <>
          <div className="section-heading">
            <h2>종류별</h2>
            <span className="section-count">
              {categoryFolders.filter(({ count }) => count > 0).length}개 묶음
            </span>
          </div>

          <section className="bucket-list">
            {categoryFolders.map((folder) => (
              <BucketCard
                key={folder.id}
                bucket={folder}
                count={folder.count}
                icon={folder.icon}
                extraCount={Math.max(0, folder.count - 3)}
                onClick={() => onSelectFolder(folder.id)}
              />
            ))}
          </section>
        </>
      ) : (
        <>
          <div className="section-heading">
            <h2>기간별</h2>
            <span className="section-count">{periodFolders.length}개 묶음</span>
          </div>

          {periodFolders.length > 0 ? (
            <section className="bucket-list period-bucket-list">
              {periodFolders.map((folder) => (
                <BucketCard
                  key={folder.id}
                  bucket={folder}
                  count={folder.count}
                  icon={folder.icon}
                  extraCount={Math.max(0, folder.count - 3)}
                  onClick={() => onSelectFolder(folder.id)}
                />
              ))}
            </section>
          ) : (
            <section className="empty-mini">
              <FolderOpen size={24} />
              <div>
                <strong>아직 기간 묶음이 없어요</strong>
                <span>사진을 불러오면 날짜별로 나눠요.</span>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function getPeriodFolders(items: ClassifiedItem[]) {
  const grouped = new Map<string, ClassifiedItem[]>();

  for (const item of items) {
    const bucketItems = grouped.get(item.periodKey) ?? [];
    bucketItems.push(item);
    grouped.set(item.periodKey, bucketItems);
  }

  return Array.from(grouped.entries())
    .map(([periodKey, periodItems]) => ({
      id: `period:${periodKey}` as MapFolderId,
      label: periodItems[0]?.periodLabel ?? "기간 없음",
      shortLabel: "기간",
      caption: "기간 폴더",
      tone: "blue",
      icon: <CalendarDays size={20} />,
      count: periodItems.length,
      items: periodItems,
    }))
    .sort((left, right) => right.count - left.count);
}
