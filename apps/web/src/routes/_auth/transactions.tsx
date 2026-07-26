import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import Loader from "@/components/loader";
import { PaginationControls } from "@/components/pagination-controls";
import type { LedgerEntryType } from "@/components/transactions/ledger-table";
import { LedgerTable } from "@/components/transactions/ledger-table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/transactions")({
  component: TransactionsPage,
  head: () =>
    buildSeoHead({
      title: "Transactions | Zapx",
      description: "Every credit, withdrawal and refund on your account.",
      path: "/transactions",
      noIndex: true,
    }),
});

const ALL_TYPES = "all";
type TypeFilter = typeof ALL_TYPES | LedgerEntryType;

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: ALL_TYPES, label: "All types" },
  { value: "credit", label: "Credit" },
  { value: "debit", label: "Debit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "refund", label: "Refund" },
];

function TransactionsPage() {
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState<TypeFilter>(ALL_TYPES);

  const { data, isLoading } = trpc.balance.getLedger.useQuery({
    limit,
    offset,
    type: type === ALL_TYPES ? undefined : type,
  });

  // Ledger rows only carry `apiId`; this aggregate is the one authorized place
  // an API's name is available to resolve it against.
  const { data: usage } = trpc.analytics.getUsageByApi.useQuery({});

  const apiNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const row of usage ?? []) {
      if (row.apiId && row.apiName) {
        names[row.apiId] = row.apiName;
      }
    }
    return names;
  }, [usage]);

  const handleTypeChange = (value: string) => {
    setType(value as TypeFilter);
    setOffset(0);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setOffset(0);
  };

  const entries = data?.entries ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <p className="text-muted-foreground text-sm">
          Append-only ledger of every credit, withdrawal and refund on your
          account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading entries…"
              : `${totalCount.toLocaleString()} ${totalCount === 1 ? "entry" : "entries"}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={handleTypeChange} value={type}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && <Loader />}

          {!isLoading && entries.length > 0 && (
            <>
              <LedgerTable apiNames={apiNames} entries={entries} />
              <PaginationControls
                limit={limit}
                offset={offset}
                onLimitChange={handleLimitChange}
                onPageChange={setOffset}
                total={totalCount}
              />
            </>
          )}

          {!isLoading && entries.length === 0 && (
            <Empty className="min-h-[220px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Receipt />
                </EmptyMedia>
                <EmptyTitle>
                  {type === ALL_TYPES
                    ? "No transactions yet"
                    : "No matching transactions"}
                </EmptyTitle>
                <EmptyDescription>
                  {type === ALL_TYPES
                    ? "Ledger entries appear as soon as callers start paying for your endpoints."
                    : "Try a different type filter to see more entries."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
