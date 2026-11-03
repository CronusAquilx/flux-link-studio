// Client-side reads go through the RLS-scoped browser client: users only ever see their own rows.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function rows<T>(p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const q = {
  connections: queryOptions({
    queryKey: ["connections"],
    queryFn: () => rows(supabase.from("aws_connections").select("*").order("created_at")),
  }),
  buckets: queryOptions({
    queryKey: ["buckets"],
    queryFn: () => rows(supabase.from("buckets").select("*").order("name")),
  }),
  links: queryOptions({
    queryKey: ["links"],
    queryFn: () => rows(supabase.from("links").select("*").order("created_at", { ascending: false }).limit(1000)),
  }),
  rules: queryOptions({
    queryKey: ["rules"],
    queryFn: () => rows(supabase.from("automation_rules").select("*").order("created_at")),
  }),
  presets: queryOptions({
    queryKey: ["presets"],
    queryFn: () => rows(supabase.from("presets").select("*").order("created_at")),
  }),
  uploads: queryOptions({
    queryKey: ["uploads"],
    queryFn: () => rows(supabase.from("uploads").select("*").order("created_at", { ascending: false }).limit(500)),
  }),
  projects: queryOptions({
    queryKey: ["projects"],
    queryFn: () => rows(supabase.from("projects").select("*").order("created_at", { ascending: false })),
  }),
  activity: queryOptions({
    queryKey: ["activity"],
    queryFn: () => rows(supabase.from("activity").select("*").order("created_at", { ascending: false }).limit(300)),
  }),
  plans: queryOptions({
    queryKey: ["plans"],
    queryFn: () => rows(supabase.from("assistant_plans").select("*").order("created_at", { ascending: false }).limit(20)),
  }),
  profile: queryOptions({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return { user: u.user, profile: data };
    },
  }),
};

export function linkUrl(l: { kind: string; slug: string }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/${l.kind === "flux_v3" ? "v3" : "m"}/${l.slug}`;
}

export async function log(action: string, detail: string) {
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("activity").insert({ user_id: data.user.id, action, detail });
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Upload with real byte progress via XHR to a presigned PUT URL. */
export function putWithProgress(url: string, file: Blob, onProgress: (loaded: number) => void, contentType?: string) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () =>
      reject(new Error("Upload blocked. Enable browser uploads for this bucket on the Buckets page (it sets CORS for this site)."));
    xhr.send(file);
  });
}

export function download(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
