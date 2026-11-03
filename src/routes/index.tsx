import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, KeyRound, Link2, Lock, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flux Links — share files from your own S3 buckets" },
      {
        name: "description",
        content:
          "Connect your AWS account with a least-privilege role, upload to private S3 buckets, and share signed, revocable Flux links.",
      },
      { property: "og:title", content: "Flux Links — share files from your own S3 buckets" },
      {
        property: "og:description",
        content:
          "Private-by-default S3 sharing with signed, expiring, revocable links and a built-in setup assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: KeyRound,
    t: "No keys handed over",
    d: "You create a scoped IAM role in your AWS account with a unique External ID. We only ever get 15-minute temporary credentials.",
  },
  {
    icon: Lock,
    t: "Private by default",
    d: "Buckets we create have public access blocked and encryption on. Files are only reachable through signed links.",
  },
  {
    icon: Link2,
    t: "Flux V3 & Flux Mini links",
    d: "Long or short share links that sign a fresh URL on every click. Set expiry, revoke anytime.",
  },
  {
    icon: Upload,
    t: "Bulk uploads & automations",
    d: "Drop files or whole folders with live progress. Rules turn finished uploads into links automatically.",
  },
  {
    icon: Bot,
    t: "Flux AI setup assistant",
    d: "Inspects your own resources, proposes a plan, and runs only the steps you approve.",
  },
  {
    icon: Zap,
    t: "Share Lovable projects",
    d: "Paste a published Lovable app URL and get a branded Flux redirect link you can disable or expire.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-flux text-primary-foreground">
            <Zap className="h-4 w-4" />
          </span>
          Flux Links
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth" search={{ mode: "signin" }}>
              Sign in
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started
            </Link>
          </Button>
        </nav>
      </header>
      <section className="relative overflow-hidden">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center">
          <p className="mb-4 inline-block rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
            your bucket · your account · your links
          </p>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Share files from <span className="text-flux">your own S3</span>, safely.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            Flux Links connects to your AWS account through a role you control, uploads into private
            buckets, and hands out signed links that expire and can be revoked.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth" search={{ mode: "signup" }}>
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-3 px-5 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.t} className="rounded-lg border border-border bg-card p-5">
            <f.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Flux Links. S3 storage and request costs are billed by AWS to your own account.
      </footer>
    </div>
  );
}
