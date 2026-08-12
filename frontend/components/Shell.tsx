import { ReactNode } from "react";
import Link from "next/link";
import { useAuthenticationStatus, useSignOut, useUserData } from "@nhost/react";
import ThemeToggle from "@/components/ThemeToggle";

export default function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { isAuthenticated } = useAuthenticationStatus();
  const user = useUserData();
  const { signOut } = useSignOut();

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
            {isAuthenticated && (
              <div className="row" style={{ gap: 8 }}>
                <span className="muted">{user?.email}</span>
                <button onClick={() => signOut()}>Sign out</button>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="container fade-in">{children}</main>
    </>
  );
}
