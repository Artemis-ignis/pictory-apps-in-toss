import {
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  FileText,
  Heart,
  Image,
  Images,
  ReceiptText,
  Sparkles,
  Soup,
  Upload,
  UserRound,
} from "lucide-react";
import { BucketCard } from "../components/BucketCard";
import { BucketPhotoTray } from "../components/BucketPhotoTray";
import { Mascot } from "../components/Mascot";
import { MetricCard } from "../components/MetricCard";
import type { AlbumImportMode } from "../features/album/albumAdapter";
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
  importMode: AlbumImportMode;
  importDate: string;
  onImportModeChange: (mode: AlbumImportMode) => void;
  onImportDateChange: (date: string) => void;
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
  place: <Images size={20} />,
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
  importMode,
  importDate,
  onImportModeChange,
  onImportDateChange,
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
  const primaryLabel = getPrimaryActionLabel(importMode, isScanning);
  const albumPreviewItems = items
    .filter((item) => item.privacy !== "sensitive")
    .slice(0, 12);

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

      <section className="import-panel" aria-label="가져오기 방식">
        <div className="import-mode-grid">
          <button
            type="button"
            className={importMode === "recent" ? "is-active" : ""}
            onClick={() => onImportModeChange("recent")}
          >
            <Clock3 size={17} />
            <span>최신순</span>
          </button>
          <button
            type="button"
            className={importMode === "oldest" ? "is-active" : ""}
            onClick={() => onImportModeChange("oldest")}
          >
            <CalendarDays size={17} />
            <span>오래된순</span>
          </button>
          <button
            type="button"
            className={importMode === "date" ? "is-active" : ""}
            onClick={() => onImportModeChange("date")}
          >
            <CalendarDays size={17} />
            <span>날짜</span>
          </button>
          <button
            type="button"
            className={importMode === "instagram" ? "is-active" : ""}
            onClick={() => onImportModeChange("instagram")}
          >
            <Images size={17} />
            <span>인스타</span>
          </button>
        </div>
        {importMode === "date" ? (
          <input
            aria-label="가져올 날짜"
            className="import-date-input"
            type="date"
            value={importDate}
            onChange={(event) => onImportDateChange(event.currentTarget.value)}
          />
        ) : null}
      </section>

      <section className="action-stack" aria-label="사진 정리 시작">
        <button className="primary-action" type="button" onClick={onScan}>
          <Image size={22} />
          <span>{primaryLabel}</span>
          <ChevronRight size={26} />
        </button>
        <div className="secondary-actions">
          <button className="soft-action" type="button" onClick={onReward}>
            <Sparkles size={19} />
            <span>AI 30장 받기</span>
            {credits > 0 ? <b>{credits}</b> : null}
          </button>
          <button className="soft-action" type="button" onClick={onPick}>
            <Upload size={19} />
            <span>사진 선택</span>
          </button>
        </div>
      </section>

      <p className="privacy-note">원본 저장 안 함 · 기기 안에서 분석</p>
      <p className="dev-note">{scanMessage}</p>

      <BucketPhotoTray items={albumPreviewItems} title="최근 앨범" />

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
          남은 정리 {scanAllowance.totalLeft}장 · AI 정밀분류권 {credits}장
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
          label="분류 결과"
          value={`${kindCount || 0}개`}
          caption={`${items.length}장 분류됨`}
          tone="blue"
          icon={<UserRound size={18} />}
        />
        <MetricCard
          label="사진 월"
          value={`${periodCount || 0}개`}
          caption="사진 날짜 기준"
          tone="green"
          icon={<CalendarDays size={18} />}
        />
        <MetricCard
          label="정리 후보"
          value={`${cleanCount}장`}
          caption="삭제 전 검토"
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

function getPrimaryActionLabel(mode: AlbumImportMode, isScanning: boolean) {
  if (isScanning) {
    return "사진 분류 중";
  }

  if (mode === "oldest") {
    return "오래된 후보 정리";
  }

  if (mode === "date") {
    return "날짜 후보 찾기";
  }

  if (mode === "instagram") {
    return "인스타 후보 고르기";
  }

  return "앨범 정리 시작";
}
