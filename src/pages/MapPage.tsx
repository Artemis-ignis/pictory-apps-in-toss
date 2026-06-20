import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Archive,
  CalendarDays,
  Camera,
  Check,
  FileText,
  FolderOpen,
  Heart,
  ReceiptText,
  Soup,
  Trash2,
  UserRound,
} from "lucide-react";
import { BucketCard } from "../components/BucketCard";
import { BucketPhotoTray } from "../components/BucketPhotoTray";
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
  place: <FolderOpen size={20} />,
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
  const categoryFolders: MapFolder[] = MAP_BUCKETS.map((bucket) => ({
    id: `category:${bucket.id}` as MapFolderId,
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
  const mapPreviewFolders = categoryFolders
    .filter((folder) => folder.count > 0)
    .slice(0, 5);
  const mapPreviewItems = getMapPreviewItems(items).slice(0, 10);
  const activeMapRows =
    viewMode === "category"
      ? categoryFolders.filter((folder) => folder.count > 0)
      : periodFolders;
  const visibleMapRows = activeMapRows.slice(0, 3);

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
            <span>
              {selectedCategoryFolder != null ? "사진 종류" : "사진 월"}
            </span>
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
          <p>분류</p>
          <h1>
            사진 묶음을
            <br />
            한눈에
          </h1>
          <span>사진 종류와 날짜 흐름으로 묶었어요</span>
        </div>
        <Mascot variant="map" />
      </section>

      <AlbumMapPreview
        folders={mapPreviewFolders}
        items={mapPreviewItems}
        onSelectFolder={onSelectFolder}
      />

      {visibleMapRows.length > 0 ? (
        <section className="map-summary-list" aria-label="대표 사진 묶음">
          {visibleMapRows.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="map-summary-row"
              onClick={() => onSelectFolder(folder.id)}
            >
              <span className={`folder-icon tone-${folder.tone}`}>
                {folder.icon}
              </span>
              <span>
                <strong>{folder.label}</strong>
                <small>{folder.caption}</small>
              </span>
              <b>{folder.count}장</b>
            </button>
          ))}
        </section>
      ) : null}

      <BucketPhotoTray items={mapPreviewItems} title="분류된 사진" />

      <div className="folder-mode-tabs" aria-label="분류 보기 방식">
        <button
          type="button"
          className={viewMode === "category" ? "is-active" : ""}
          aria-pressed={viewMode === "category"}
          onClick={() => onViewModeChange("category")}
        >
          사진 종류
        </button>
        <button
          type="button"
          className={viewMode === "period" ? "is-active" : ""}
          aria-pressed={viewMode === "period"}
          onClick={() => onViewModeChange("period")}
        >
          사진 월
        </button>
      </div>

      {viewMode === "category" ? (
        <>
          <div className="section-heading">
            <h2>사진 종류</h2>
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
            <h2>사진 월</h2>
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
                <strong>아직 월별 묶음이 없어요</strong>
                <span>사진을 정리하면 사진 날짜 기준으로 나눠요.</span>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

type MapFolder = {
  id: MapFolderId;
  label: string;
  shortLabel: string;
  caption: string;
  tone: string;
  icon: JSX.Element;
  count: number;
  items: ClassifiedItem[];
};

type MapPreviewFolder = Pick<
  MapFolder,
  "id" | "label" | "shortLabel" | "tone" | "count"
>;

function AlbumMapPreview({
  folders,
  items,
  onSelectFolder,
}: {
  folders: MapPreviewFolder[];
  items: ClassifiedItem[];
  onSelectFolder: (folder: MapFolderId | "all") => void;
}) {
  return (
    <section className="album-map-preview" aria-label="앨범 분류 요약">
      <div className="album-map-flow">
        {folders.length > 0 ? (
          folders.map((folder, index) => (
            <button
              key={folder.id}
              type="button"
              className={`album-map-node tone-${folder.tone}`}
              onClick={() => onSelectFolder(folder.id)}
              style={{ "--node-index": index } as CSSProperties}
            >
              <span>{folder.shortLabel}</span>
              <b>{folder.count}장</b>
            </button>
          ))
        ) : (
          <div className="album-map-empty" role="status">
            <strong>아직 분류 묶음이 없어요</strong>
            <span>사진을 불러오면 앨범 구조가 자동으로 생겨요.</span>
          </div>
        )}
      </div>
      <div className="album-map-strip" aria-hidden="true">
        {items.slice(0, 6).map((item) => (
          <img key={item.id} src={item.dataUri} alt="" />
        ))}
      </div>
    </section>
  );
}

function getMapPreviewItems(items: ClassifiedItem[]) {
  return items.filter((item) => item.privacy !== "sensitive");
}

function getPeriodFolders(items: ClassifiedItem[]): MapFolder[] {
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
      shortLabel: "월",
      caption: "사진 날짜 기준",
      tone: "blue",
      icon: <CalendarDays size={20} />,
      count: periodItems.length,
      items: periodItems,
    }))
    .sort((left, right) => right.count - left.count);
}
