import type { RouterOutputs } from "@turborepo-boilerplate/api";
import { Badge } from "@/components/ui/badge";

export type WithdrawalStatus =
  RouterOutputs["withdrawal"]["list"][number]["status"];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Status machine: `pending` -> `approved` -> `completed`, or
 * `pending` -> `rejected`. Funds only leave the pending balance on `completed`.
 */
const STATUS_PRESENTATION: Record<
  WithdrawalStatus,
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "Pending review", variant: "secondary" },
  approved: { label: "Approved — payout in progress", variant: "outline" },
  completed: { label: "Completed", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export function WithdrawalStatusBadge({
  status,
}: {
  status: WithdrawalStatus;
}) {
  const presentation = STATUS_PRESENTATION[status] ?? {
    label: status,
    variant: "outline" as BadgeVariant,
  };

  return (
    <Badge className="whitespace-nowrap" variant={presentation.variant}>
      {presentation.label}
    </Badge>
  );
}
