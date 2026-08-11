import { ReactNode } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/dashboard" className="brand">
            <span className="brand-mark" />
            Workflow Builder
          </Link>
          <div className="row" style={{ gap: 12 }}>
            {right}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="container fade-in">{children}</main>
    </>
  );
}
