import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSignInEmailPassword, useAuthenticationStatus } from "@nhost/react";
import ThemeToggle from "@/components/ThemeToggle";

type Mode = "owner" | "member";

export default function Login() {
  const router = useRouter();
  const { isAuthenticated } = useAuthenticationStatus();
  const { signInEmailPassword, isLoading, isError, error } = useSignInEmailPassword();
  const [mode, setMode] = useState<Mode>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Your real role is fixed by org_members, not chosen here — this only decides
  // which org the dashboard auto-selects first if you belong to more than one
  // (e.g. owner in one, viewer in another).
  useEffect(() => {
    if (isAuthenticated) router.replace(`/dashboard?prefer=${mode}`);
  }, [isAuthenticated, router, mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await signInEmailPassword(email, password);
  }

  return (
    <div className="auth-shell">
      <div style={{ position: "fixed", top: 20, right: 20 }}>
        <ThemeToggle />
      </div>
      <div className="auth-card card">
        <div className="logo-hero" />
        <h1 style={{ fontSize: 22 }}>Welcome back</h1>
        <p className="muted">Sign in to the AI Agent Workflow Builder.</p>

        <div className="row" style={{ marginTop: 16, marginBottom: 4 }}>
          <button
            type="button"
            className={mode === "owner" ? "primary" : undefined}
            onClick={() => setMode("owner")}
            style={{ flex: 1 }}
          >
            Owner
          </button>
          <button
            type="button"
            className={mode === "member" ? "primary" : undefined}
            onClick={() => setMode("member")}
            style={{ flex: 1 }}
          >
            Member
          </button>
        </div>
        <p className="muted">
          If you belong to multiple organizations, this picks which one opens first — an org you own, or one
          you&rsquo;re just a member of. Your actual permissions are set per-organization either way.
        </p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="primary" type="submit" disabled={isLoading}>
            {isLoading ? <span className="spinner" /> : "Sign in"}
          </button>
          {isError && <p className="error-text">{error?.message}</p>}
        </form>
        <p className="muted" style={{ marginTop: 18 }}>
          No account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
