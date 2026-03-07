import { createFileRoute } from "@tanstack/react-router";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/billing")({
  component: RouteComponent,
  head: () =>
    buildSeoHead({
      title: "Billing | Turborepo Boilerplate",
      description:
        "Review your subscription status, manage billing, and access private data.",
      path: "/billing",
      noIndex: true,
    }),
  beforeLoad: async () => {
    const { data: customerState } = await authClient.customer.state();
    return { customerState };
  },
});

function RouteComponent() {
  const routeContext = Route.useRouteContext();
  const session = routeContext?.session;
  const customerState = routeContext?.customerState;

  if (!session?.data) {
    return <Loader />;
  }

  const activeSubscriptions = customerState?.activeSubscriptions ?? [];
  const hasProSubscription = activeSubscriptions.length > 0;

  return (
    <div>
      <h1>Billing</h1>
      <p>Welcome {session.data.user?.name}</p>
      <p>Plan: {hasProSubscription ? "Pro" : "Free"}</p>
      {hasProSubscription ? (
        <Button onClick={async () => await authClient.customer.portal()}>
          Manage Subscription
        </Button>
      ) : (
        <Button
          onClick={async () => await authClient.checkout({ slug: "pro" })}
        >
          Upgrade to Pro
        </Button>
      )}
    </div>
  );
}
