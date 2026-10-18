"use client";
import { useState } from "react";
import { api, tokens } from "@/lib/api";

export default function AuthPanel({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const t = await api<{ accessToken: string; refreshToken: string }>(
        `/auth/${mode}`,
        { method: "POST", body: { email, password } },
      );
      tokens.set(t.accessToken, t.refreshToken);
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h2>{mode === "register" ? "Open a demo account" : "Sign in"}</h2>
      <p className="muted">
        {mode === "register"
          ? "New accounts start with 100,000 USDT, 2 BTC, 30 ETH and 500 SOL of play money."
          : "Welcome back."}
      </p>
      <form>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
      </form>
      {err && <div className="err">{err}</div>}
      <button
        className="primary"
        disabled={busy || !email || password.length < 8}
        onClick={submit}
      >
        {mode === "register" ? "Create account" : "Sign in"}
      </button>
      <button
        className="ghost"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account?" : "Already registered?"}
      </button>
    </div>
  );
}
