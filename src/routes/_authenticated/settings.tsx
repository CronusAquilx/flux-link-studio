import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { q } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Flux Links" },
      { name: "description", content: "Profile and account settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data, isLoading } = useQuery(q.profile);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(data?.profile?.display_name ?? "");
    setCompany(data?.profile?.company ?? "");
  }, [data]);

  const save = async () => {
    if (!data) return;
    const { error } = await supabase.from("profiles").upsert({
      id: data.user.id,
      display_name: name.trim().slice(0, 80),
      company: company.trim().slice(0, 80),
      onboarded: true,
    });
    if (error) return void toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const changePw = async () => {
    if (!data?.user.email) return;
    if (pw.length < 8) return void toast.error("New password must be at least 8 characters");
    setBusy(true);
    const { error: e1 } = await supabase.auth.signInWithPassword({
      email: data.user.email,
      password: cur,
    });
    if (e1) {
      setBusy(false);
      return void toast.error("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setCur("");
    setPw("");
    toast.success("Password changed");
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="text-xs text-muted-foreground">{data?.user.email}</p>
        <div className="space-y-1">
          <Label htmlFor="n">Display name</Label>
          <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="c">Company</Label>
          <Input id="c" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <Button size="sm" onClick={save}>
          Save profile
        </Button>
      </section>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Change password</h2>
        <p className="text-xs text-muted-foreground">
          Signed in with Google or Lovable? Use "Forgot password" on the sign-in page to set one.
        </p>
        <div className="space-y-1">
          <Label htmlFor="cur">Current password</Label>
          <Input id="cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="np">New password</Label>
          <Input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" onClick={changePw} disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </Button>
      </section>
      <Button variant="outline" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
