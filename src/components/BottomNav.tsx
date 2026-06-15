import { Archive, BrushCleaning, Home, Map } from "lucide-react";

export type TabId = "home" | "map" | "clean" | "saved";

interface BottomNavProps {
  activeTab: TabId;
  onChange: (tabId: TabId) => void;
}

const tabs = [
  { id: "home", label: "홈", icon: Home },
  { id: "map", label: "지도", icon: Map },
  { id: "clean", label: "정리", icon: BrushCleaning },
  { id: "saved", label: "보관", icon: Archive },
] satisfies Array<{
  id: TabId;
  label: string;
  icon: typeof Home;
}>;

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav-item ${selected ? "is-active" : ""}`}
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={22} strokeWidth={2.4} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
