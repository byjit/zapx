import type { RouterOutputs } from "@turborepo-boilerplate/api";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatUsd, truncateId } from "@/lib/format";

type LedgerEntry = RouterOutputs["balance"]["getLedger"]["entries"][number];
export type LedgerEntryType = LedgerEntry["type"];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const TYPE_PRESENTATION: Record<
  LedgerEntryType,
  { label: string; variant: BadgeVariant }
> = {
  credit: { label: "Credit", variant: "default" },
  debit: { label: "Debit", variant: "destructive" },
  withdrawal: { label: "Withdrawal", variant: "secondary" },
  refund: { label: "Refund", variant: "outline" },
};

interface LedgerTableProps {
  entries: LedgerEntry[];
  /** apiId -> API name, so rows can show a label instead of an opaque id. */
  apiNames: Record<string, string>;
}

export function LedgerTable({ entries, apiNames }: LedgerTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="whitespace-nowrap">Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Platform fee</TableHead>
          <TableHead className="text-right">Provider credit</TableHead>
          <TableHead>API</TableHead>
          <TableHead>Request</TableHead>
          <TableHead>Tx hash</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const presentation = TYPE_PRESENTATION[entry.type] ?? {
            label: entry.type,
            variant: "outline" as BadgeVariant,
          };
          const apiLabel = entry.apiId
            ? (apiNames[entry.apiId] ?? truncateId(entry.apiId))
            : "—";

          return (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(entry.createdAt)}
              </TableCell>
              <TableCell>
                <Badge variant={presentation.variant}>
                  {presentation.label}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatUsd(entry.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatUsd(entry.platformFee)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatUsd(entry.providerCredit)}
              </TableCell>
              <TableCell className="max-w-[160px] truncate">
                {apiLabel}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {truncateId(entry.requestId)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {entry.paymentTxHash ? (
                  <span className="flex items-center gap-1">
                    {truncateId(entry.paymentTxHash)}
                    <CopyButton
                      label="Transaction hash copied"
                      value={entry.paymentTxHash}
                    />
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
