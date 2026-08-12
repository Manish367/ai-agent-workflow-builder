import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMutation } from "@apollo/client";
import { useSignUpEmailPassword, useAuthenticationStatus } from "@nhost/react";
import { CREATE_ORGANIZATION } from "@/graphql/queries";
import ThemeToggle from "@/components/ThemeToggle";

type Mode = "owner" | "member";

export default function Signup() {
  const router = useRouter();
  const { isAuthenticated } = useAuthenticationStatus();
  const { signUpEmailPassword, isLoading, isError, error, needsEmailVerification } = useSignUpEmailPassword();
  const [createOrg] = useMutation(CREATE_ORGANIZATION);

  const [mode, setMode] = useState<Mode>("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [settingUpOrg, setSettingUpOrg] = useState(false);

  // Signup only authenticates the account; creating the org has to happen after
  // that succeeds (it needs a valid session to know who the owner is). Stashing
  // the intent in a ref survives the async gap between submit and isAuthenticated
  // flipping true.
  const pendingOrgName = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      if (pendingOrgName.current) {
        setSettingUpOrg(true);
        try {
          await createOrg({ variables: { name: pendingOrgName.current } });
        } finally {
          pendingOrgName.current = null;
        }
      }
      router.replace("/dashboard");
    })();
  }, [isAuthenticated, createOrg, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "owner") pendingOrgName.current = orgName.trim();
    await signUpEmailPassword(email, password, { displayName });
  }

  return (
    <div className="auth-shell">
      <div style={{ position: "fixed", top: 20, right: 20 }}>
        <ThemeToggle />
      </div>
      <div className="auth-card card">
        <div className="logo-hero" />
        <h1 style={{ fontSize: 22 }}>Create your account</h1>
        <p className="muted">Get started with the AI Agent Workflow Builder.</p>

        <div className="row" style={{ marginTop: 16, marginBottom: 4 }}>
          <button
            type="button"
            className={mode === "owner" ? "primary" : undefined}
            onClick={() => setMode("owner")}
            style={{ flex: 1 }}
          >
            I&rsquo;m starting a new team
          </button>
          <button
            type="button"
            className={mode === "member" ? "primary" : undefined}
            onClick={() => setMode("member")}
            style={{ flex: 1 }}
          >
            I&rsquo;m joining a team
          </button>
        </div>
        <p className="muted">
          {mode === "owner"
            ? "You'll create a new organization and become its owner — free to build workflows, invite teammates, and manage everything, right after you sign up."
            : "You'll need an invite. Once you're signed up, send your email to that organization's owner and ask them to add you from their Members panel."}
        </p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
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
          {mode === "owner" && (
            <input
              placeholder="Organization name"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          )}
          <button className="primary" type="submit" disabled={isLoading || settingUpOrg}>
            {isLoading || settingUpOrg ? <span className="spinner" /> : "Sign up"}
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
