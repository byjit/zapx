import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  /** Already-formatted value — money must go through `formatUsd` first. */
  value: string;
  /** Short clarification of what the number means. */
  hint?: string;
  icon?: LucideIcon;
  isLoading?: boolean;
  /** Optional footer slot, e.g. a link out to a detail page. */
  children?: ReactNode;
}

/** Single metric tile, shared by the dashboard and the withdrawals page. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  isLoading = false,
  children,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <CardTitle className="text-2xl tabular-nums break-all sm:text-3xl">
            {value}
          </CardTitle>
        )}
        {Icon && (
          <CardAction>
            <Icon className="size-4 text-muted-foreground" />
          </CardAction>
        )}
        {hint && <CardDescription className="text-xs">{hint}</CardDescription>}
        {children}
      </CardHeader>
    </Card>
  );
}
