import type { ReactNode } from "react";

type MascotVariant = "home" | "map" | "clean" | "saved" | "empty";

interface MascotProps {
  variant: MascotVariant;
  size?: "hero" | "card" | "empty";
  children?: ReactNode;
}

const mascotSrc: Record<MascotVariant, string> = {
  home: "/pictory-mascot-home.png",
  map: "/pictory-mascot-map.png",
  clean: "/pictory-mascot-clean.png",
  saved: "/pictory-mascot-saved.png",
  empty: "/pictory-mascot-empty.png",
};

export function Mascot({ variant, size = "card", children }: MascotProps) {
  return (
    <div className={`mascot mascot-${variant} mascot-${size}`} aria-hidden>
      <img src={mascotSrc[variant]} alt="" draggable={false} />
      {children}
    </div>
  );
}
