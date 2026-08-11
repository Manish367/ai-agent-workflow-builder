import { useTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme" title="Toggle light/dark theme">
      <span className={`theme-toggle-icon ${theme}`}>{theme === "dark" ? "🌙" : "☀️"}</span>
    </button>
  );
}
