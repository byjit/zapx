import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import Loader from "@/components/loader";
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
import { authClient } from "@/lib/auth-client";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/billing")({
  component: RouteComponent,
  head: () =>
    buildSeoHead({
      title: "Billing | Zapx",
      description: "Review your subscription status and manage billing.",
      path: "/billing",
      noIndex: true,
    }),
  beforeLoad: async () => {
    // The Polar plugin is currently disabled on the server, so this endpoint
    // is not mounted. Resolve to `null` rather than failing the route load —
    // the page then renders an explicit "not configured" state, and starts
    // working again as soon as the plugin is re-enabled.
    try {
      const { data, error } = await authClient.customer.state();
      return { customerState: error ? null : data };
    } catch {
      return { customerState: null };
    }
  },
});

function RouteComponent() {
  const routeContext = Route.useRouteContext();
  const session = routeContext?.session;
  const customerState = routeContext?.customerState;

  if (!session?.data) {
    return <Loader />;
  }

  if (!customerState) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
        </div>
        <Empty className="min-h-[300px] border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CreditCard />
            </EmptyMedia>
            <EmptyTitle>Billing is not configured</EmptyTitle>
            <EmptyDescription>
              Subscription billing is disabled for this deployment. Per-request
              API revenue is unaffected — see your dashboard, transactions and
              withdrawals for earnings and payouts.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const activeSubscriptions = customerState.activeSubscriptions ?? [];
  const hasProSubscription = activeSubscriptions.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Manage your subscription plan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Current plan</CardDescription>
          <CardTitle className="text-2xl">
            {hasProSubscription ? "Pro" : "Free"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasProSubscription ? (
            <Button onClick={async () => await authClient.customer.portal()}>
              Manage subscription
            </Button>
          ) : (
            <Button
              onClick={async () => await authClient.checkout({ slug: "pro" })}
            >
              Upgrade to Pro
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
