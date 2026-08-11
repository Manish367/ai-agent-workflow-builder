import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSignUpEmailPassword, useAuthenticationStatus } from "@nhost/react";
import ThemeToggle from "@/components/ThemeToggle";

export default function Signup() {
  const router = useRouter();
  const { isAuthenticated } = useAuthenticationStatus();
  const { signUpEmailPassword, isLoading, isError, error, needsEmailVerification } = useSignUpEmailPassword();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await signUpEmailPassword(email, password, { displayName });
  }

  return (
    <div className="auth-shell">
      <div style={{ position: "fixed", top: 20, right: 20 }}>
        <ThemeToggle />
      </div>
      <div className="auth-card card">
        <div className="logo-hero" />
        <h1 style={{ fontSize: 22 }}>Create account</h1>
        <p className="muted">
          After signing up, ask an org owner to add you via <code>org_members</code> (or apply the demo seed —
          see the README) — a brand-new account has no organization yet.
        </p>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <input placeholder="Display name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            type="password"
            placeholder="Password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="primary" type="submit" disabled={isLoading}>
            {isLoading ? <span className="spinner" /> : "Sign up"}
          </button>
          {isError && <p className="error-text">{error?.message}</p>}
          {needsEmailVerification && <p className="muted">Check your email to verify your account.</p>}
        </form>
        <p className="muted" style={{ marginTop: 18 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
