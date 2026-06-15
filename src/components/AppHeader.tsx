import { Bell } from "lucide-react";

interface AppHeaderProps {
  onNotify: () => void;
}

export function AppHeader({ onNotify }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <img src="/pictory-icon.png" alt="" className="brand-icon" />
        <strong>픽토리</strong>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="알림"
        onClick={onNotify}
      >
        <Bell size={22} strokeWidth={2.4} />
      </button>
    </header>
  );
}
