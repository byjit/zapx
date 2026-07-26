import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Coins,
  FolderKanban,
  Hourglass,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ApiUsageTable } from "@/components/dashboard/api-usage-table";
import Loader from "@/components/loader";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatCount, formatUsd } from "@/lib/format";
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
  const { data: summary, isLoading: isSummaryLoading } =
    trpc.analytics.getSummary.useQuery();
  const { data: usage, isLoading: isUsageLoading } =
    trpc.analytics.getUsageByApi.useQuery({});

  if (!session?.data) {
    return <Loader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Welcome back, {session.data.user?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Revenue and usage across every API you monetize.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/transactions">
            <Button className="gap-1.5" size="sm" variant="outline">
              <Receipt className="size-3.5" />
              Transactions
            </Button>
          </Link>
          <Link to="/withdrawals">
            <Button className="gap-1.5" size="sm">
              <Banknote className="size-3.5" />
              Withdraw funds
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          hint={`Net of platform fees · ${formatUsd(summary?.totalGrossVolume)} gross`}
          icon={TrendingUp}
          isLoading={isSummaryLoading}
          label="Earnings"
          value={formatUsd(summary?.totalProviderCredits)}
        />
        <StatCard
          hint="Ready to withdraw"
          icon={Wallet}
          isLoading={isSummaryLoading}
          label="Available balance"
          value={formatUsd(summary?.availableBalance)}
        />
        <StatCard
          hint="Requested withdrawals awaiting payout"
          icon={Hourglass}
          isLoading={isSummaryLoading}
          label="Pending balance"
          value={formatUsd(summary?.pendingBalance)}
        />
        <StatCard
          hint="USDC already sent to your wallet"
          icon={Banknote}
          isLoading={isSummaryLoading}
          label="Total withdrawn"
          value={formatUsd(summary?.totalWithdrawn)}
        />
        <StatCard
          hint="Paid requests served by the gateway"
          icon={Coins}
          isLoading={isSummaryLoading}
          label="Total requests"
          value={formatCount(summary?.totalRequests)}
        />
        <StatCard
          icon={FolderKanban}
          label="Projects"
          value={formatCount(projects?.length)}
        >
          <Link className="mt-1" to="/projects">
            <Button className="-ml-2 gap-1" size="sm" variant="ghost">
              View projects
              <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </StatCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage by API</CardTitle>
          <CardDescription>
            Requests and earnings per API, all time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isUsageLoading ? (
            <Loader />
          ) : usage && usage.length > 0 ? (
            <ApiUsageTable usage={usage} />
          ) : (
            <Empty className="min-h-[180px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Coins />
                </EmptyMedia>
                <EmptyTitle>No paid requests yet</EmptyTitle>
                <EmptyDescription>
                  Once a caller pays for one of your endpoints, its usage and
                  earnings show up here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
