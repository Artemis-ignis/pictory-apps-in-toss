import {
  Camera,
  FileText,
  Heart,
  MapPin,
  ReceiptText,
  Soup,
  UserRound,
} from "lucide-react";
import { Fragment } from "react";
import { BucketCard } from "../components/BucketCard";
import { BucketPhotoTray } from "../components/BucketPhotoTray";
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
  const filtered =
    selectedBucket === "all"
      ? items
      : items.filter((item) => item.categoryId === selectedBucket);
  const buckets = MAP_BUCKETS.map((bucket) => ({
    bucket,
    count: items.filter((item) => item.categoryId === bucket.id).length,
  }));

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
        {buckets.map(({ bucket, count }) => {
          const bucketItems = items.filter(
            (item) => item.categoryId === bucket.id,
          );
          return (
            <Fragment key={bucket.id}>
              <BucketCard
                bucket={bucket}
                count={count}
                icon={icons[bucket.id]}
                extraCount={Math.max(0, count - 3)}
                selected={selectedBucket === bucket.id}
                onClick={() => onSelectBucket(bucket.id)}
              />
              {selectedBucket === bucket.id ? (
                <BucketPhotoTray
                  items={bucketItems}
                  title={bucket.label}
                  onSave={onSave}
                  onQueue={onQueue}
                  onIgnore={onIgnore}
                />
              ) : null}
            </Fragment>
          );
        })}
      </section>

      <section className="photo-list">
        {filtered.slice(0, 10).map((item) => (
          <PhotoTile
            key={item.id}
            item={item}
            onSave={onSave}
            onQueue={onQueue}
            onIgnore={onIgnore}
          />
        ))}
      </section>
    </main>
  );
}
