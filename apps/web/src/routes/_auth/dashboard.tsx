import { createFileRoute, Link } from "@tanstack/react-router";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardComponent,
  head: () =>
    buildSeoHead({
      title: "Dashboard | Turborepo Boilerplate",
      description:
        "Review your subscription status, manage billing, and access private data.",
      path: "/dashboard",
      noIndex: true,
    }),
});

function DashboardComponent() {
  const routeContext = Route.useRouteContext();
  const session = routeContext?.session;

  const { data: privateData } = trpc.system.privateData.useQuery();

  if (!session?.data) {
    return <Loader />;
  }

  return (
    <div className="space-y-2 flex flex-col ">
      <h1>Dashboard</h1>
      <p>Welcome {session.data.user?.name}</p>
      <p>API: {privateData?.message}</p>
      <Link to="/billing">
        <Button>Billing</Button>
      </Link>
    </div>
  );
}
