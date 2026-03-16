import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: AuthLayout,
  head: () =>
    buildSeoHead({
      noIndex: true,
    }),
});

/** Breadcrumb label overrides for known route segments */
const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  settings: "Settings",
  billing: "Billing",
  admin: "Admin",
  ai: "AI Playground",
};

function AuthBreadcrumbs() {
  const matches = useMatches();

  // Build crumbs from the matched route segments, skipping the root and layout routes
  const crumbs = matches
    .filter((m) => m.pathname !== "/" && m.id !== "/_auth")
    .map((m) => ({
      label:
        // Use static context label if provided by the route, otherwise derive from path
        (m.staticData as { breadcrumb?: string })?.breadcrumb ??
        BREADCRUMB_LABELS[m.pathname.split("/").pop() ?? ""] ??
        m.pathname.split("/").pop() ??
        "",
      path: m.pathname,
    }))
    // Deduplicate consecutive paths (layout vs index)
    .filter(
      (crumb, i, arr) => i === 0 || crumb.path !== arr[i - 1]?.path
    );

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <BreadcrumbItem key={crumb.path}>
              {!isLast ? (
                <>
                  <BreadcrumbLink href={crumb.path}>
                    {crumb.label}
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function AuthLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <AuthBreadcrumbs />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
