import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
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
import { compareDecimal, formatUsd } from "@/lib/format";
import { trpc } from "@/utils/trpc";

/**
 * Mirrors `withdrawal.request` on the server. The server remains the
 * authority — this only avoids a round-trip for obvious mistakes.
 */
const AMOUNT_REGEX = /^\d+(\.\d{1,6})?$/;
const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const MINIMUM_AMOUNT = "1";

interface WithdrawalRequestFormProps {
  availableBalance: string;
}

/** Returns a validation message, or `null` when the input is acceptable. */
function validate(amount: string, walletAddress: string): string | null {
  if (!AMOUNT_REGEX.test(amount)) {
    return "Enter an amount like 25 or 25.500000 (max 6 decimal places).";
  }

  if (compareDecimal(amount, MINIMUM_AMOUNT) < 0) {
    return "The minimum withdrawal is $1.00.";
  }

  if (!WALLET_ADDRESS_REGEX.test(walletAddress)) {
    return "Enter a valid EVM wallet address (0x followed by 40 hex characters).";
  }

  return null;
}

export function WithdrawalRequestForm({
  availableBalance,
}: WithdrawalRequestFormProps) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const requestMutation = trpc.withdrawal.request.useMutation({
    onSuccess: () => {
      toast.success(
        "Withdrawal requested — funds are held in your pending balance until the payout is sent."
      );
      setAmount("");
      setWalletAddress("");
      setError(null);
      utils.balance.get.invalidate();
      utils.withdrawal.list.invalidate();
      utils.analytics.getSummary.invalidate();
    },
    onError: (mutationError) => {
      toast.error(mutationError.message);
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedAmount = amount.trim();
    const trimmedWallet = walletAddress.trim();
    const validationError =
      validate(trimmedAmount, trimmedWallet) ??
      (compareDecimal(trimmedAmount, availableBalance) > 0
        ? `You can withdraw at most ${formatUsd(availableBalance)}.`
        : null);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    requestMutation.mutate({
      amount: trimmedAmount,
      walletAddress: trimmedWallet,
    });
  };

  const canWithdraw = compareDecimal(availableBalance, MINIMUM_AMOUNT) >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request a withdrawal</CardTitle>
        <CardDescription>
          {formatUsd(availableBalance)} available. Requests are reviewed
          manually; USDC is sent to your wallet once the payout is marked
          completed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="withdrawal-amount">Amount (USDC)</Label>
                <Button
                  className="h-auto p-0 text-xs"
                  disabled={!canWithdraw}
                  onClick={() => setAmount(availableBalance)}
                  type="button"
                  variant="link"
                >
                  Use max
                </Button>
              </div>
              <Input
                autoComplete="off"
                id="withdrawal-amount"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="25.00"
                value={amount}
              />
              <p className="text-muted-foreground text-xs">
                Minimum $1.00, up to 6 decimal places.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="withdrawal-wallet">Wallet address</Label>
              <Input
                autoComplete="off"
                className="font-mono"
                id="withdrawal-wallet"
                maxLength={42}
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="0x0000000000000000000000000000000000000000"
                value={walletAddress}
              />
              <p className="text-muted-foreground text-xs">
                The EVM address that receives the USDC payout.
              </p>
            </div>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          {!canWithdraw && (
            <p className="text-muted-foreground text-sm">
              You need at least $1.00 available before you can request a
              withdrawal.
            </p>
          )}

          <Button
            disabled={!canWithdraw || requestMutation.isPending}
            type="submit"
          >
            {requestMutation.isPending ? "Submitting…" : "Request withdrawal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
