import {
  CalendarDays,
  Camera,
  ChevronRight,
  FileText,
  Heart,
  Image,
  Images,
  MapPin,
  ReceiptText,
  Sparkles,
  Soup,
  Upload,
  UserRound,
} from "lucide-react";
import { BucketCard } from "../components/BucketCard";
import { Mascot } from "../components/Mascot";
import { MetricCard } from "../components/MetricCard";
import { isCleanTabItem } from "../features/album/classifier";
import {
  MAP_BUCKETS,
  type ClassifiedItem,
  type MapBucketId,
} from "../features/album/types";

interface HomePageProps {
  items: ClassifiedItem[];
  credits: number;
  isScanning: boolean;
  scanMessage: string;
  onScan: () => void;
  onPick: () => void;
  onReward: () => void;
  onViewAll: () => void;
}

const homeIcons: Record<MapBucketId, JSX.Element> = {
  capture: <Camera size={20} />,
  document: <FileText size={20} />,
  receipt: <ReceiptText size={20} />,
  food: <Soup size={20} />,
  place: <MapPin size={20} />,
  people: <UserRound size={20} />,
  coupon: <ReceiptText size={20} />,
  memory: <Heart size={20} />,
};

export function HomePage({
  items,
  credits,
  isScanning,
  scanMessage,
  onScan,
  onPick,
  onReward,
  onViewAll,
}: HomePageProps) {
  const kindCount = new Set(items.map((item) => item.categoryId)).size;
  const periodCount = new Set(items.map((item) => item.periodKey)).size;
  const cleanCount = items.filter(isCleanTabItem).length;
  const bucketCounts = MAP_BUCKETS.map((bucket) => ({
    bucket,
    count: items.filter((item) => item.categoryId === bucket.id).length,
  })).filter(({ count }) => count > 0);
  const previewBuckets =
    bucketCounts.length > 0
      ? bucketCounts.slice(0, 2)
      : MAP_BUCKETS.slice(0, 2).map((bucket) => ({ bucket, count: 0 }));

  return (
    <main className="screen home-screen">
      <section className="home-hero">
        <div>
          <p>사진첩이 많을 때</p>
          <h1>
            사진 정리
            <br />
            한눈에
          </h1>
        </div>
        <Mascot variant="home" size="hero" />
      </section>

      <section className="action-stack" aria-label="사진 정리 시작">
        <button className="primary-action" type="button" onClick={onScan}>
          <Image size={22} />
          <span>{isScanning ? "지도 만드는 중" : "지도 만들기"}</span>
          <ChevronRight size={26} />
        </button>
        <div className="secondary-actions">
          <button className="soft-action" type="button" onClick={onReward}>
            <Sparkles size={19} />
            <span>광고 보기</span>
            {credits > 0 ? <b>{credits}</b> : null}
          </button>
          <button className="soft-action" type="button" onClick={onPick}>
            <Upload size={19} />
            <span>사진 테스트</span>
          </button>
        </div>
      </section>

      <p className="privacy-note">원본 저장 안 함 · 기기 안 분석</p>
      <p className="dev-note">{scanMessage}</p>

      <section className="metric-grid" aria-label="요약">
        <MetricCard
          label="종류별"
          value={`${kindCount || 0}개`}
          caption={`총 ${items.length}장`}
          tone="blue"
          icon={<UserRound size={18} />}
        />
        <MetricCard
          label="기간"
          value={`${periodCount || 0}개`}
          caption="오늘 ~ 이전"
          tone="green"
          icon={<CalendarDays size={18} />}
        />
        <MetricCard
          label="확인"
          value={`${cleanCount}장`}
          caption="중복 · 민감"
          tone="orange"
          icon={<Images size={18} />}
        />
      </section>

      <section className="preview-section">
        <div className="section-heading">
          <h2>최근 결과</h2>
          <button type="button" onClick={onViewAll}>
            전체 <ChevronRight size={16} />
          </button>
        </div>
        <div className="bucket-list home-bucket-list">
          {previewBuckets.map(({ bucket, count }) => (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              count={count}
              icon={homeIcons[bucket.id]}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
