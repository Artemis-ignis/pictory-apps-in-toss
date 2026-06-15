import type { ReactNode } from "react";
import type { BucketMeta } from "../features/album/types";

interface BucketCardProps {
  bucket: BucketMeta;
  count: number;
  icon: ReactNode;
  extraCount?: number;
  selected?: boolean;
  onClick?: () => void;
}

export function BucketCard({
  bucket,
  count,
  icon,
  extraCount = 0,
  selected = false,
  onClick,
}: BucketCardProps) {
  return (
    <button
      type="button"
      className={`bucket-card tone-${bucket.tone} ${selected ? "is-selected" : ""}`}
      onClick={onClick}
    >
      <span className="bucket-icon">{icon}</span>
      <strong>{bucket.label}</strong>
      <span className="bucket-previews" aria-hidden>
        <i />
        <i />
        <i />
        {extraCount > 0 ? <em>+{extraCount}</em> : null}
      </span>
      <b>{count}장</b>
    </button>
  );
}
