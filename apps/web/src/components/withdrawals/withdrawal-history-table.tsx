import type { RouterOutputs } from "@turborepo-boilerplate/api";
import { CopyButton } from "@/components/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WithdrawalStatusBadge } from "@/components/withdrawals/withdrawal-status-badge";
import { formatDateTime, formatUsd, truncateId } from "@/lib/format";

type Withdrawal = RouterOutputs["withdrawal"]["list"][number];

/** The signed-in provider's own withdrawal requests, newest first. */
export function WithdrawalHistoryTable({
  withdrawals,
}: {
  withdrawals: Withdrawal[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="whitespace-nowrap">Requested</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Wallet</TableHead>
          <TableHead>Payout tx</TableHead>
          <TableHead className="whitespace-nowrap">Processed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {withdrawals.map((withdrawal) => (
          <TableRow key={withdrawal.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDateTime(withdrawal.createdAt)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatUsd(withdrawal.amount)}
            </TableCell>
            <TableCell>
              <WithdrawalStatusBadge status={withdrawal.status} />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                {truncateId(withdrawal.walletAddress)}
                <CopyButton
                  label="Wallet address copied"
                  value={withdrawal.walletAddress}
                />
              </span>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {withdrawal.payoutTxHash ? (
                <span className="flex items-center gap-1">
                  {truncateId(withdrawal.payoutTxHash)}
                  <CopyButton
                    label="Payout transaction hash copied"
                    value={withdrawal.payoutTxHash}
                  />
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDateTime(withdrawal.processedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
