import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrystalGem } from "@/components/layout/AppSplash";

/**
 * Presentational only — it calls signIn and renders whatever comes back. It has
 * no knowledge of Supabase. Wears the boot splash's Orbit backdrop and glass
 * (index.html), so start-up runs splash to sign-in without a change of scene.
 */
export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await signIn(email, password);
    if (signInError) setError(signInError);
    setSubmitting(false);
  }

  return (
    <div className="auth-screen boot-scene min-h-screen flex items-center justify-center p-4 sm:p-6">
      <form onSubmit={handleSubmit} className="auth-card boot-glass w-full max-w-sm space-y-5 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CrystalGem id="login-gem" className="auth-gem" />
          <h1 className="boot-splash-title">Crystal OS</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="auth-submit w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
