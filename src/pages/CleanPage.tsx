import {
  Camera,
  FileArchive,
  ImageOff,
  Moon,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Fragment } from "react";
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
}: CleanPageProps) {
  const candidates = items.filter(isCleanTabItem);
  const filtered =
    selectedBucket === "all"
      ? candidates
      : candidates.filter((item) => cleanBucketMatches(item, selectedBucket));
  const buckets = CLEAN_BUCKETS.map((bucket) => ({
    bucket,
    count: candidates.filter((item) => cleanBucketMatches(item, bucket.id))
      .length,
  }));

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
        <button type="button" onClick={() => onSelectBucket("all")}>
          {candidates.length}장
        </button>
      </div>

      <section className="bucket-list">
        {buckets.map(({ bucket, count }) => {
          const bucketItems = candidates.filter((item) =>
            cleanBucketMatches(item, bucket.id),
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
                  onQueue={onQueue}
                  onSave={onSave}
                  onIgnore={onIgnore}
                />
              ) : null}
            </Fragment>
          );
        })}
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

      <section className="photo-list">
        {filtered.slice(0, 10).map((item) => (
          <PhotoTile
            key={item.id}
            item={item}
            onQueue={onQueue}
            onSave={onSave}
            onIgnore={onIgnore}
          />
        ))}
      </section>
    </main>
  );
}
