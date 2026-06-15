import {
  ArrowLeft,
  Camera,
  FileText,
  FolderOpen,
  Heart,
  MapPin,
  ReceiptText,
  Soup,
  UserRound,
} from "lucide-react";
import { BucketCard } from "../components/BucketCard";
import { Mascot } from "../components/Mascot";
import { PhotoTile } from "../components/PhotoTile";
import {
  MAP_BUCKETS,
  type ClassifiedItem,
  type MapBucketId,
} from "../features/album/types";

interface MapPageProps {
  items: ClassifiedItem[];
  selectedBucket: MapBucketId | "all";
  onSelectBucket: (bucket: MapBucketId | "all") => void;
  onSave: (id: string) => void;
  onQueue: (id: string) => void;
  onIgnore: (id: string) => void;
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
  selectedBucket,
  onSelectBucket,
  onSave,
  onQueue,
  onIgnore,
}: MapPageProps) {
  const buckets = MAP_BUCKETS.map((bucket) => ({
    bucket,
    count: items.filter((item) => item.categoryId === bucket.id).length,
  }));
  const selectedBucketMeta =
    selectedBucket === "all"
      ? null
      : MAP_BUCKETS.find((bucket) => bucket.id === selectedBucket);
  const selectedItems =
    selectedBucketMeta == null
      ? []
      : items.filter((item) => item.categoryId === selectedBucketMeta.id);

  if (selectedBucketMeta != null) {
    return (
      <main className="screen folder-screen">
        <section className="folder-header">
          <button
            type="button"
            className="folder-back"
            onClick={() => onSelectBucket("all")}
          >
            <ArrowLeft size={19} />
            <span>종류별</span>
          </button>
          <div className={`folder-icon tone-${selectedBucketMeta.tone}`}>
            {icons[selectedBucketMeta.id] ?? <FolderOpen size={22} />}
          </div>
          <div>
            <p>지도 폴더</p>
            <h1>{selectedBucketMeta.label}</h1>
            <span>{selectedItems.length}장</span>
          </div>
        </section>

        {selectedItems.length > 0 ? (
          <section className="photo-list folder-photo-list">
            {selectedItems.map((item) => (
              <PhotoTile
                key={item.id}
                item={item}
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
          <h1>종류별로 한눈에</h1>
          <span>
            {items.length}장 · {buckets.filter(({ count }) => count > 0).length}
            개 묶음
          </span>
        </div>
        <Mascot variant="map" />
      </section>

      <div className="section-heading">
        <h2>종류별</h2>
        <button type="button" onClick={() => onSelectBucket("all")}>
          {buckets.filter(({ count }) => count > 0).length}개 묶음
        </button>
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
    </main>
  );
}
