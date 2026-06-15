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
  type MapFolderId,
  type PlanId,
} from "../features/album/types";
import {
  USAGE_PLANS,
  type ScanAllowance,
  type UsagePlan,
} from "../features/billing/plans";

interface HomePageProps {
  items: ClassifiedItem[];
  credits: number;
  plan: UsagePlan;
  scanAllowance: ScanAllowance;
  savedCount: number;
  selectedPlanId: PlanId;
  isScanning: boolean;
  scanMessage: string;
  onScan: () => void;
  onPick: () => void;
  onReward: () => void;
  onSelectPlan: (planId: PlanId) => void;
  onViewAll: () => void;
  onOpenMapFolder: (folderId: MapFolderId) => void;
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
  plan,
  scanAllowance,
  savedCount,
  selectedPlanId,
  isScanning,
  scanMessage,
  onScan,
  onPick,
  onReward,
  onSelectPlan,
  onViewAll,
  onOpenMapFolder,
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

      <p className="privacy-note">원본 저장 안 함 · 기기 안에서 분석</p>
      <p className="dev-note">{scanMessage}</p>

      <section className="capacity-panel" aria-label="정리 한도">
        <div className="capacity-row">
          <div>
            <span>현재 플랜</span>
            <strong>{plan.label}</strong>
          </div>
          <div>
            <span>이번 배치</span>
            <strong>{scanAllowance.nextBatchLimit}장</strong>
          </div>
          <div>
            <span>보관함</span>
            <strong>
              {savedCount}/{plan.storageLimit}
            </strong>
          </div>
        </div>
        <div className="credit-meter" aria-label="남은 정리 가능 장수">
          <span
            style={{
              width: `${Math.min(
                100,
                (scanAllowance.totalLeft /
                  Math.max(1, plan.monthlyScanCredits)) *
                  100,
              )}%`,
            }}
          />
        </div>
        <p>
          남은 정리 {scanAllowance.totalLeft}장 · 광고 크레딧 {credits}장
        </p>
      </section>

      <section className="plan-strip" aria-label="플랜">
        {USAGE_PLANS.map((usagePlan) => (
          <button
            key={usagePlan.id}
            type="button"
            className={selectedPlanId === usagePlan.id ? "is-active" : ""}
            onClick={() => onSelectPlan(usagePlan.id)}
          >
            <b>{usagePlan.label}</b>
            <span>{usagePlan.monthlyScanCredits}장</span>
          </button>
        ))}
      </section>

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
              onClick={() => onOpenMapFolder(`category:${bucket.id}`)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
