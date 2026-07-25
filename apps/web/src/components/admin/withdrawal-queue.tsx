import type { RouterOutputs } from "@turborepo-boilerplate/api";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import Loader from "@/components/loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WithdrawalStatus } from "@/components/withdrawals/withdrawal-status-badge";
import { WithdrawalStatusBadge } from "@/components/withdrawals/withdrawal-status-badge";
import { formatDateTime, formatUsd, truncateId } from "@/lib/format";
import { trpc } from "@/utils/trpc";

type AdminWithdrawal = RouterOutputs["admin"]["listWithdrawals"][number];

const ALL_STATUSES = "all";
type StatusFilter = typeof ALL_STATUSES | WithdrawalStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: ALL_STATUSES, label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

type QueueAction = "approve" | "reject" | "complete";

/**
 * Copy for each confirmation. `complete` is the only step that actually moves
 * money out of the pending balance, so it is the one that asks for a tx hash.
 */
const ACTION_COPY: Record<
  QueueAction,
  {
    title: string;
    description: string;
    actionLabel: string;
    destructive: boolean;
  }
> = {
  approve: {
    title: "Approve withdrawal?",
    description:
      "Approving marks the request ready for payout. Funds stay in the provider's pending balance until you send the USDC and mark it completed.",
    actionLabel: "Approve",
    destructive: false,
  },
  reject: {
    title: "Reject withdrawal?",
    description:
      "Rejecting returns the full amount to the provider's available balance and appends a refund entry to their ledger. This cannot be undone. If the request was already approved, only reject it when the USDC has NOT been sent — the payout happens out of band and rejecting after sending would pay the provider twice.",
    actionLabel: "Reject",
    destructive: true,
  },
  complete: {
    title: "Mark payout completed?",
    description:
      "Only do this after the USDC has actually been sent. It moves the amount out of the pending balance and into total withdrawn, and cannot be undone.",
    actionLabel: "Mark completed",
    destructive: false,
  },
};

const PAGE_SIZE = 20;

/**
 * Legal transitions, mirroring the server guards: `pending` can be approved or
 * rejected, `approved` can be completed or still rejected — nothing has been sent
 * until it is completed, so a bounced transfer can be refunded.
 */
function availableActions(status: WithdrawalStatus): QueueAction[] {
  if (status === "pending") {
    return ["approve", "reject"];
  }

  return status === "approved" ? ["complete", "reject"] : [];
}

export function WithdrawalQueue() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<{
    withdrawal: AdminWithdrawal;
    action: QueueAction;
  } | null>(null);
  const [payoutTxHash, setPayoutTxHash] = useState("");

  const { data: withdrawals, isLoading } = trpc.admin.listWithdrawals.useQuery({
    status: status === ALL_STATUSES ? undefined : status,
    limit: PAGE_SIZE,
    offset,
  });

  const closeDialog = () => {
    setPending(null);
    setPayoutTxHash("");
  };

  const mutationOptions = (successMessage: string) => ({
    onSuccess: () => {
      toast.success(successMessage);
      utils.admin.listWithdrawals.invalidate();
      closeDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
      closeDialog();
    },
  });

  const approveMutation = trpc.admin.approveWithdrawal.useMutation(
    mutationOptions("Withdrawal approved — send the USDC, then mark completed.")
  );
  const rejectMutation = trpc.admin.rejectWithdrawal.useMutation(
    mutationOptions("Withdrawal rejected and refunded to available balance.")
  );
  const completeMutation = trpc.admin.completeWithdrawal.useMutation(
    mutationOptions("Payout marked completed.")
  );

  const isMutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    completeMutation.isPending;

  const confirmAction = () => {
    if (!pending) {
      return;
    }

    const { withdrawal, action } = pending;

    if (action === "approve") {
      approveMutation.mutate({ id: withdrawal.id });
      return;
    }

    if (action === "reject") {
      rejectMutation.mutate({ id: withdrawal.id });
      return;
    }

    completeMutation.mutate({
      id: withdrawal.id,
      payoutTxHash: payoutTxHash.trim() || undefined,
    });
  };

  const handleStatusChange = (value: string) => {
    setStatus(value as StatusFilter);
    setOffset(0);
  };

  const rows = withdrawals ?? [];
  const copy = pending ? ACTION_COPY[pending.action] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdrawal Queue</CardTitle>
        <CardDescription>
          Review payout requests. Approve marks a request ready; funds only
          leave the pending balance when you mark the payout completed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select onValueChange={handleStatusChange} value={status}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading && <Loader />}

        {!isLoading && rows.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No withdrawal requests found
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">
                      Requested
                    </TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Payout tx</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Processed
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((withdrawal) => (
                    <TableRow key={withdrawal.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(withdrawal.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {truncateId(withdrawal.userId)}
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {availableActions(withdrawal.status).map((action) => (
                            <Button
                              disabled={isMutating}
                              key={action}
                              onClick={() => setPending({ withdrawal, action })}
                              size="sm"
                              variant={
                                ACTION_COPY[action].destructive
                                  ? "destructive"
                                  : "outline"
                              }
                            >
                              {ACTION_COPY[action].actionLabel}
                            </Button>
                          ))}
                          {availableActions(withdrawal.status).length === 0 && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Showing {offset + 1}–{offset + rows.length}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  size="sm"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={rows.length < PAGE_SIZE}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  size="sm"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        open={Boolean(pending)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {copy?.description}
              {pending &&
                ` Amount: ${formatUsd(pending.withdrawal.amount)} to ${pending.withdrawal.walletAddress}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pending?.action === "complete" && (
            <div className="grid gap-2">
              <Label htmlFor="payout-tx-hash">
                Payout transaction hash{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                autoComplete="off"
                className="font-mono"
                id="payout-tx-hash"
                onChange={(event) => setPayoutTxHash(event.target.value)}
                placeholder="0x…"
                value={payoutTxHash}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                copy?.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={isMutating}
              onClick={(event) => {
                event.preventDefault();
                confirmAction();
              }}
            >
              {copy?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
