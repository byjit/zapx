import type { RouterOutputs } from "@turborepo-boilerplate/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatUsd, truncateId } from "@/lib/format";

type ApiUsage = RouterOutputs["analytics"]["getUsageByApi"][number];

/** Per-API request volume and earnings, aggregated from credit ledger rows. */
export function ApiUsageTable({ usage }: { usage: ApiUsage[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>API</TableHead>
          <TableHead className="text-right">Requests</TableHead>
          <TableHead className="text-right">Gross</TableHead>
          <TableHead className="text-right">Earnings</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {usage.map((row) => (
          <TableRow key={row.apiId ?? "unknown"}>
            <TableCell className="font-medium">
              {row.apiName ?? (
                <span className="text-muted-foreground">
                  Deleted API ({truncateId(row.apiId)})
                </span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCount(row.requestCount)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {formatUsd(row.totalGrossVolume)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatUsd(row.totalProviderCredits)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
