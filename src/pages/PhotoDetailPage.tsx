import {
  Archive,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FileText,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  CLEAN_BUCKETS,
  MAP_BUCKETS,
  type ClassifiedItem,
} from "../features/album/types";

interface PhotoDetailPageProps {
  item: ClassifiedItem;
  onBack: () => void;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onQueue: (id: string) => void;
  onIgnore: (id: string) => void;
}

export function PhotoDetailPage({
  item,
  onBack,
  onSave,
  onUnsave,
  onQueue,
  onIgnore,
}: PhotoDetailPageProps) {
  const sensitivePreview = shouldProtectPreview(item);
  const canRevealPreview = sensitivePreview && hasRealPreview(item.dataUri);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const protectedPreview = sensitivePreview && !isPreviewVisible;
  const category = MAP_BUCKETS.find((bucket) => bucket.id === item.categoryId);
  const cleanBucket = CLEAN_BUCKETS.find(
    (bucket) => bucket.id === item.cleanBucketId,
  );
  const isSaved = item.status === "saved";

  return (
    <main className="screen photo-detail-screen">
      <section className="detail-header">
        <button type="button" className="folder-back" onClick={onBack}>
          <ArrowLeft size={19} />
          <span>사진</span>
        </button>
        <div>
          <p>분류 결과</p>
          <h1>{getDetailTitle(item, category?.shortLabel)}</h1>
          <span>{item.periodLabel} · 원본은 기기 안에 있어요</span>
        </div>
      </section>

      <section
        className={`detail-preview ${protectedPreview ? "is-protected" : ""}`}
      >
        {item.dataUri ? (
          <img src={item.dataUri} alt={item.fileName ?? "사진"} />
        ) : (
          <FileText size={44} />
        )}
        {protectedPreview ? (
          <div className="detail-mask">
            <ShieldAlert size={24} />
            <div>
              <strong>민감정보 보호 중</strong>
              <span>
                {canRevealPreview
                  ? "이 화면에서만 직접 확인할 수 있어요"
                  : "원본은 앨범에서 확인해요"}
              </span>
            </div>
            {canRevealPreview ? (
              <button
                type="button"
                onClick={() => setIsPreviewVisible(true)}
              >
                <Eye size={16} />
                <span>보기</span>
              </button>
            ) : null}
          </div>
        ) : sensitivePreview && canRevealPreview ? (
          <button
            type="button"
            className="detail-privacy-toggle"
            onClick={() => setIsPreviewVisible(false)}
          >
            <EyeOff size={16} />
            <span>다시 가리기</span>
          </button>
        ) : null}
      </section>

      <section className="detail-status-grid">
        <article>
          <span>사진 종류</span>
          <strong>{category?.label ?? item.categoryId}</strong>
        </article>
        <article>
          <span>추천 처리</span>
          <strong>{cleanBucket?.label ?? item.cleanBucketId}</strong>
        </article>
      </section>

      <section className="detail-guidance">
        <h2>{getGuidanceTitle(item)}</h2>
        <p>{getGuidanceBody(item, canRevealPreview)}</p>
      </section>

      <section className="detail-actions" aria-label="사진 처리">
        <button
          type="button"
          className={isSaved ? "is-active" : ""}
          onClick={() => (isSaved ? onUnsave(item.id) : onSave(item.id))}
        >
          <Archive size={18} />
          <span>{isSaved ? "해제" : "보관"}</span>
        </button>
        <button
          type="button"
          className={item.status === "queued" ? "is-active" : ""}
          onClick={() => onQueue(item.id)}
        >
          <Trash2 size={18} />
          <span>정리</span>
        </button>
        <button
          type="button"
          className={item.status === "ignored" ? "is-active" : ""}
          onClick={() => onIgnore(item.id)}
        >
          <Check size={18} />
          <span>제외</span>
        </button>
      </section>
    </main>
  );
}

function getDetailTitle(item: ClassifiedItem, categoryLabel?: string) {
  if (item.privacy === "sensitive" || item.cleanBucketId === "sensitive") {
    return "민감정보 후보예요";
  }

  if (item.cleanBucketId === "needsReview") {
    return `${categoryLabel ?? "사진"} 확인이 필요해요`;
  }

  if (item.cleanBucketId === "similar") {
    return "비슷한 사진이에요";
  }

  if (item.cleanBucketId === "dark") {
    return "품질 확인이 필요해요";
  }

  if (item.cleanBucketId === "capturePile") {
    return "캡처로 묶었어요";
  }

  return `${categoryLabel ?? "사진"}으로 분류했어요`;
}

function shouldProtectPreview(item: ClassifiedItem) {
  return item.privacy === "sensitive" || item.cleanBucketId === "sensitive";
}

function hasRealPreview(dataUri: string) {
  return dataUri !== "" && !dataUri.startsWith("data:image/svg+xml,");
}

function getGuidanceTitle(item: ClassifiedItem) {
  if (item.privacy === "sensitive" || item.cleanBucketId === "sensitive") {
    return "개인정보가 보일 수 있어요";
  }

  if (item.cleanBucketId === "similar") {
    return "하나만 남겨도 괜찮을 수 있어요";
  }

  if (item.cleanBucketId === "dark") {
    return "어둡거나 흔들렸을 수 있어요";
  }

  if (item.cleanBucketId === "capturePile") {
    return "캡처 화면으로 모았어요";
  }

  if (item.cleanBucketId === "needsReview") {
    return "다시 볼 가능성이 있어요";
  }

  return "보관해도 좋은 사진이에요";
}

function getGuidanceBody(item: ClassifiedItem, canRevealPreview: boolean) {
  if (item.privacy === "sensitive" || item.cleanBucketId === "sensitive") {
    if (canRevealPreview) {
      return "민감한 정보가 포함됐을 수 있어 기본으로 가렸어요. 이번에 가져온 사진은 여기서 확인할 수 있고, 앱에는 원본을 저장하지 않아요.";
    }

    return "민감한 정보가 포함됐을 수 있어 기본으로 가렸어요. 앱에는 원본을 저장하지 않으니 실제 원본은 앨범에서 확인하세요.";
  }

  if (item.cleanBucketId === "similar") {
    return "비슷한 사진 묶음입니다. 필요한 사진만 보관하고 나머지는 정리 후보로 표시할 수 있어요.";
  }

  if (item.cleanBucketId === "dark") {
    return "화질이 낮을 수 있는 사진입니다. 필요하면 보관하고, 아니면 정리 후보로 표시하세요.";
  }

  if (item.cleanBucketId === "capturePile") {
    return "정보 확인용 캡처일 수 있어 따로 모았어요. 필요 없는 화면은 정리 후보로 옮기면 됩니다.";
  }

  if (item.cleanBucketId === "needsReview") {
    return "문서, 영수증, 쿠폰처럼 나중에 필요할 수 있어 바로 정리하지 않고 확인 후보로 모았어요.";
  }

  return "일상 사진으로 보관하기 좋은 항목입니다. 필요 없으면 제외하거나 정리 후보로 바꿀 수 있어요.";
}
