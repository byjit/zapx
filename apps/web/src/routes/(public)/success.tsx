import { createFileRoute, useSearch } from "@tanstack/react-router";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/(public)/success")({
  component: SuccessPage,
  validateSearch: (search) => ({
    checkout_id: search.checkout_id as string,
  }),
  head: () =>
    buildSeoHead({
      title: "Checkout success | Turborepo Boilerplate",
      description:
        "Your payment was successful. Review your receipt or manage your subscription in the dashboard.",
      path: "/success",
      noIndex: true,
    }),
});

function SuccessPage() {
  const { checkout_id } = useSearch({ from: "/(public)/success" });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1>Payment Successful!</h1>
      {checkout_id && <p>Checkout ID: {checkout_id}</p>}
    </div>
  );
}
