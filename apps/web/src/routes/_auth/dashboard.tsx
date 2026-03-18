import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FolderKanban } from "lucide-react";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardComponent,
  head: () =>
    buildSeoHead({
      title: "Dashboard | Zapx",
      description: "Overview of your API monetization platform.",
      path: "/dashboard",
      noIndex: true,
    }),
});

function DashboardComponent() {
  const routeContext = Route.useRouteContext();
  const session = routeContext?.session;
  const { data: projects } = trpc.project.list.useQuery();

  if (!session?.data) {
    return <Loader />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back, {session.data.user?.name?.split(" ")[0] ?? "there"}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Projects</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {projects?.length ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/projects">
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                <FolderKanban className="size-3.5" />
                View projects
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
