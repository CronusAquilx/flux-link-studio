import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password · Flux Links" },
      { name: "description", content: "Choose a new password for your Flux Links account." },
      { property: "og:title", content: "Set a new password · Flux Links" },
      { property: "og:description", content: "Choose a new password for your Flux Links account." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "PASSWORD_RECOVERY" || e === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => s.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return void toast.error("Password must be at least 8 characters");
    if (pw !== pw2) return void toast.error("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  };
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        {!ready && <p className="text-sm text-muted-foreground">Open this page from the reset link in your email.</p>}
        <div className="space-y-1"><Label htmlFor="p1">New password</Label><Input id="p1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="p2">Confirm password</Label><Input id="p2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <Button className="w-full" disabled={!ready || busy}>{busy ? "Saving…" : "Update password"}</Button>
      </form>
    </div>
  );
}
