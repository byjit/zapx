import type { RouterOutputs } from "@turborepo-boilerplate/api";
import {
  ENDPOINT_PRICE_HINT,
  isValidEndpointPrice,
} from "@turborepo-boilerplate/api/pricing";
import { format } from "date-fns";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { env } from "@/env";
import { trpc } from "@/utils/trpc";

type ProjectApi = RouterOutputs["api"]["listByProject"][number];
type ProjectEndpoint = ProjectApi["endpoints"][number];

interface ApiEndpointsTableProps {
  api: ProjectApi;
  projectId: string;
}

const methodVariantMap: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  GET: "secondary",
  POST: "default",
  PUT: "outline",
  PATCH: "outline",
  DELETE: "destructive",
};

/** An endpoint with no price is rejected by the gateway with a 400. */
const isUnpriced = (endpoint: ProjectEndpoint) =>
  !endpoint.priceUsdc || endpoint.priceUsdc.trim().length === 0;

export function ApiEndpointsTable({ api, projectId }: ApiEndpointsTableProps) {
  const utils = trpc.useUtils();
  const [pricesByEndpointId, setPricesByEndpointId] = useState<
    Record<string, string>
  >({});
  const [savingEndpointId, setSavingEndpointId] = useState<string | null>(null);

  useEffect(() => {
    setPricesByEndpointId(
      Object.fromEntries(
        api.endpoints.map((endpoint) => [endpoint.id, endpoint.priceUsdc ?? ""])
      )
    );
  }, [api.endpoints]);

  const updatePricingMutation = trpc.api.updateEndpointPricing.useMutation({
    onSuccess: () => {
      toast.success("Endpoint price updated");
      utils.api.listByProject.invalidate({ projectId });
      utils.project.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setSavingEndpointId(null);
    },
  });

  // The routing key callers must use: /gateway/:apiId/<endpoint path>.
  const gatewayBaseUrl = `${env.SERVER_URL}/gateway/${api.id}`;

  const endpointRows = useMemo(
    () =>
      api.endpoints.map((endpoint) => {
        const draftPrice = pricesByEndpointId[endpoint.id] ?? "";
        const hasChanged = draftPrice !== (endpoint.priceUsdc ?? "");
        const isValidPrice =
          draftPrice.length > 0 && isValidEndpointPrice(draftPrice);

        return {
          endpoint,
          draftPrice,
          hasChanged,
          isValidPrice,
        };
      }),
    [api.endpoints, pricesByEndpointId]
  );

  const unpricedCount = api.endpoints.filter(isUnpriced).length;

  const saveEndpointPrice = (endpoint: ProjectEndpoint, draftPrice: string) => {
    if (!isValidEndpointPrice(draftPrice)) {
      toast.error(ENDPOINT_PRICE_HINT);
      return;
    }

    setSavingEndpointId(endpoint.id);
    updatePricingMutation.mutate({
      endpointId: endpoint.id,
      priceUsdc: draftPrice,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {api.name}
              {unpricedCount > 0 && (
                <Badge variant="destructive">
                  {unpricedCount} unpriced{" "}
                  {unpricedCount === 1 ? "endpoint" : "endpoints"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>{api.baseUrl}</CardDescription>
          </div>
          <div className="text-muted-foreground text-xs">
            Imported{" "}
            {format(new Date(api.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </div>
        </div>

        {/* P2-8: the provider cannot publish their API without this URL. */}
        <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3">
          <span className="font-medium text-xs">Gateway base URL</span>
          <div className="flex items-start gap-1">
            <code className="break-all font-mono text-xs">
              {gatewayBaseUrl}
            </code>
            <CopyButton
              label="Gateway base URL copied"
              value={gatewayBaseUrl}
            />
          </div>
          <span className="text-muted-foreground text-xs">
            Share this prefix with callers — append an endpoint path below and
            the gateway handles payment before proxying to {api.baseUrl}.
          </span>
        </div>

        <CardDescription>
          Configure a per-endpoint USDC price for each route parsed from the
          uploaded OpenAPI spec.
          {unpricedCount > 0 &&
            " Unpriced endpoints are rejected by the gateway with a 400 until a price is set."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="w-[120px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpointRows.map(
              ({ endpoint, draftPrice, hasChanged, isValidPrice }) => (
                <TableRow key={endpoint.id}>
                  <TableCell>
                    <Badge
                      variant={methodVariantMap[endpoint.method] ?? "outline"}
                      className="min-w-14 justify-center"
                    >
                      {endpoint.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal font-mono text-xs">
                    <span className="flex items-start gap-1">
                      {endpoint.path}
                      <CopyButton
                        label="Full endpoint URL copied"
                        value={`${gatewayBaseUrl}${endpoint.path}`}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[320px] whitespace-normal text-muted-foreground">
                    {endpoint.summary ||
                      endpoint.description ||
                      endpoint.operationId ||
                      "No description"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Input
                        value={draftPrice}
                        onChange={(event) =>
                          setPricesByEndpointId((current) => ({
                            ...current,
                            [endpoint.id]: event.target.value,
                          }))
                        }
                        placeholder="$0.001"
                        className="max-w-[140px]"
                      />
                      {isUnpriced(endpoint) && (
                        <Badge variant="destructive">Unpriced</Badge>
                      )}
                      {draftPrice && !isValidPrice ? (
                        <p className="text-destructive text-xs">
                          {ENDPOINT_PRICE_HINT}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={
                        !hasChanged ||
                        !isValidPrice ||
                        savingEndpointId === endpoint.id
                      }
                      onClick={() => saveEndpointPrice(endpoint, draftPrice)}
                    >
                      <Save className="size-3.5" />
                      {savingEndpointId === endpoint.id ? "Saving..." : "Save"}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
