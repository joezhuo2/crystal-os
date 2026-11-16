import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrystalGem } from "@/components/layout/AppSplash";

/**
 * Shown once, when Supabase keys are still configured and nothing has been
 * imported yet. Wears the boot splash's Orbit backdrop and glass (index.html),
 * so start-up runs splash to this page without a change of scene.
 */
export default function ImportPage() {
  const { error: apiError, retry, importFromSupabase, startFresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"import" | "fresh" | null>(null);

  async function run(kind: "import" | "fresh", work: () => Promise<{ error: string | null }>) {
    setBusy(kind);
    setError(null);
    const result = await work();
    if (result.error) setError(result.error);
    setBusy(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run("import", () => importFromSupabase({ email, password }));
  }

  if (apiError) {
    return (
      <div className="auth-screen boot-scene min-h-screen flex items-center justify-center p-4 sm:p-6">
        <div className="auth-card boot-glass w-full max-w-sm space-y-5 p-8 text-center">
          <CrystalGem id="login-gem" className="auth-gem mx-auto" />
          <h1 className="boot-splash-title">Crystal OS</h1>
          <p role="alert" className="text-sm text-destructive">
            The local API could not be reached: {apiError}
          </p>
          <Button type="button" className="auth-submit w-full" onClick={retry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen boot-scene min-h-screen flex items-center justify-center p-4 sm:p-6">
      <form onSubmit={handleSubmit} className="auth-card boot-glass w-full max-w-sm space-y-5 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CrystalGem id="login-gem" className="auth-gem" />
          <h1 className="boot-splash-title">Crystal OS</h1>
          <p className="text-sm text-muted-foreground">
            Your data now lives on this device. Sign in to Supabase one last time to copy your tasks, transactions,
            habits and history here. Nothing is deleted from Supabase.
          </p>
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

        <Button type="submit" className="auth-submit w-full" disabled={busy !== null}>
          {busy === "import" ? "Importing…" : "Import my data"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={busy !== null}
          onClick={() => void run("fresh", startFresh)}
        >
          {busy === "fresh" ? "Starting…" : "Start fresh without importing"}
        </Button>
      </form>
    </div>
  );
}
