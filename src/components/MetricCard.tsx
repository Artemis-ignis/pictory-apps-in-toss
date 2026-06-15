import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  caption: string;
  tone: "blue" | "green" | "orange";
  icon: ReactNode;
}

export function MetricCard({
  label,
  value,
  caption,
  tone,
  icon,
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <strong>{value}</strong>
      <small>{caption}</small>
      <div className="metric-bars" aria-hidden>
        {Array.from({ length: 7 }, (_, index) => (
          <i key={index} style={{ height: `${18 + index * 5}px` }} />
        ))}
      </div>
    </article>
  );
}
