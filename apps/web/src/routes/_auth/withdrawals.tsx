import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Hourglass, Wallet } from "lucide-react";
import { useState } from "react";
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
import { WithdrawalHistoryTable } from "@/components/withdrawals/withdrawal-history-table";
import { WithdrawalRequestForm } from "@/components/withdrawals/withdrawal-request-form";
import { formatUsd } from "@/lib/format";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/withdrawals")({
  component: WithdrawalsPage,
  head: () =>
    buildSeoHead({
      title: "Withdrawals | Zapx",
      description: "Request a USDC payout and track your withdrawal history.",
      path: "/withdrawals",
      noIndex: true,
    }),
});

const PAGE_SIZE = 20;

function WithdrawalsPage() {
  // `withdrawal.list` returns no total count, so history grows by page instead
  // of using the numbered pager that counted endpoints get.
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: balance, isLoading: isBalanceLoading } =
    trpc.balance.get.useQuery();
  const { data: withdrawals, isLoading: isHistoryLoading } =
    trpc.withdrawal.list.useQuery({ limit, offset: 0 });

  const rows = withdrawals ?? [];
  const hasMore = rows.length === limit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Withdrawals</h1>
        <p className="text-muted-foreground text-sm">
          Move your available balance to an EVM wallet as USDC.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          hint="Ready to withdraw"
          icon={Wallet}
          isLoading={isBalanceLoading}
          label="Available balance"
          value={formatUsd(balance?.availableBalance)}
        />
        <StatCard
          hint="Requested, awaiting payout"
          icon={Hourglass}
          isLoading={isBalanceLoading}
          label="Pending balance"
          value={formatUsd(balance?.pendingBalance)}
        />
        <StatCard
          hint="USDC already sent to your wallet"
          icon={Banknote}
          isLoading={isBalanceLoading}
          label="Total withdrawn"
          value={formatUsd(balance?.totalWithdrawn)}
        />
      </div>

      {isBalanceLoading ? (
        <Loader />
      ) : (
        <WithdrawalRequestForm
          availableBalance={balance?.availableBalance ?? "0"}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal history</CardTitle>
          <CardDescription>
            A request moves to your pending balance immediately and is only
            counted as withdrawn once the payout is marked completed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isHistoryLoading && <Loader />}

          {!isHistoryLoading && rows.length > 0 && (
            <>
              <WithdrawalHistoryTable withdrawals={rows} />
              {hasMore && (
                <Button
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                  size="sm"
                  variant="outline"
                >
                  Show more
                </Button>
              )}
            </>
          )}

          {!isHistoryLoading && rows.length === 0 && (
            <Empty className="min-h-[200px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Banknote />
                </EmptyMedia>
                <EmptyTitle>No withdrawals yet</EmptyTitle>
                <EmptyDescription>
                  Once you request a payout it appears here with its review
                  status.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
