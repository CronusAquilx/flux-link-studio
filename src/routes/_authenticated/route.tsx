import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Cable,
  Database,
  FolderKanban,
  LayoutDashboard,
  Link2,
  LogOut,
  Settings,
  Upload,
  Workflow,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmProvider } from "@/components/Confirm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    return { user: data.user };
  },
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/connections", label: "Connections", icon: Cable },
  { to: "/buckets", label: "Storage", icon: Database },
  { to: "/uploads", label: "Uploads", icon: Upload },
  { to: "/links", label: "Links", icon: Link2 },
  { to: "/automations", label: "Automations", icon: Workflow },
  { to: "/ai", label: "Flux AI", icon: Bot },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Layout() {
  const { user } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <ConfirmProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 md:flex">
          <Link to="/dashboard" className="mb-5 flex items-center gap-2 px-2 pt-1 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-flux text-primary-foreground">
              <Zap className="h-4 w-4" />
            </span>
            Flux Links
          </Link>
          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  path.startsWith(n.to) && "bg-sidebar-accent text-sidebar-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border pt-3">
            <p className="truncate px-2 text-xs text-muted-foreground">{user.email}</p>
            <button
              onClick={signOut}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-1 overflow-x-auto border-b border-border p-2 md:hidden">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "whitespace-nowrap rounded px-2 py-1 text-xs text-muted-foreground",
                  path.startsWith(n.to) && "bg-secondary text-foreground",
                )}
              >
                {n.label}
              </Link>
            ))}
            <button
              onClick={signOut}
              className="whitespace-nowrap px-2 text-xs text-muted-foreground"
            >
              Sign out
            </button>
          </div>
          <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
