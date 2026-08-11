import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSignInEmailPassword, useAuthenticationStatus } from "@nhost/react";
import ThemeToggle from "@/components/ThemeToggle";

export default function Login() {
  const router = useRouter();
  const { isAuthenticated } = useAuthenticationStatus();
  const { signInEmailPassword, isLoading, isError, error } = useSignInEmailPassword();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

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
        <h1 style={{ fontSize: 22 }}>Sign in</h1>
        <p className="muted">AI Agent Workflow Builder</p>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
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
