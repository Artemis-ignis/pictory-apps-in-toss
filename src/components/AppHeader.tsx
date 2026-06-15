import { Bell } from "lucide-react";

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand">
        <img src="/pictory-icon.svg" alt="" className="brand-icon" />
        <strong>픽토리</strong>
      </div>
      <button className="icon-button" type="button" aria-label="알림">
        <Bell size={22} strokeWidth={2.4} />
      </button>
    </header>
  );
}
