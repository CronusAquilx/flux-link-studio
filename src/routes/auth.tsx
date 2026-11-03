import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    mode: z.enum(["signin", "signup", "forgot"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Flux Links" },
      { name: "description", content: "Sign in or create your Flux Links account." },
      { property: "og:title", content: "Sign in · Flux Links" },
      { property: "og:description", content: "Sign in or create your Flux Links account." },
    ],
  }),
  component: AuthPage,
});

const safePath = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/dashboard");

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dest = safePath(search.redirect);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: dest, replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: dest, replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [dest, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const em = z.string().email().safeParse(email.trim());
    if (!em.success) return void toast.error("Enter a valid email address");
    if (mode !== "forgot" && password.length < 8) return void toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: em.data, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: em.data,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { display_name: name.trim() || undefined } },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your inbox to confirm your email, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em.data, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        setNotice("If an account exists for that email, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (p: "google" | "lovable") => {
    const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Sign-in failed");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-flux text-primary-foreground"><Zap className="h-4 w-4" /></span>
          Flux Links
        </Link>
        <div className="rounded-lg border border-border bg-card p-5">
          <h1 className="text-lg font-semibold">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <form onSubmit={submit} className="mt-4 space-y-3">
            {mode === "signup" && (
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1">
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            )}
            {notice && <p className="rounded-md bg-accent p-2 text-sm text-accent-foreground">{notice}</p>}
            <Button className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>
          {mode !== "forgot" && (
            <>
              <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
              <div className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => oauth("google")}>Continue with Google</Button>
                <Button variant="outline" className="w-full" onClick={() => oauth("lovable")}>Continue with Lovable</Button>
              </div>
            </>
          )}
          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                <button onClick={() => setMode("signup")} className="hover:text-foreground">Create account</button>
                <button onClick={() => setMode("forgot")} className="hover:text-foreground">Forgot password?</button>
              </>
            ) : (
              <button onClick={() => setMode("signin")} className="hover:text-foreground">Back to sign in</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
