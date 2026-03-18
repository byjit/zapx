import type { RouterOutputs } from "@turborepo-boilerplate/api";
import { format } from "date-fns";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { trpc } from "@/utils/trpc";

type ProjectApi = RouterOutputs["api"]["listByProject"][number];
type ProjectEndpoint = ProjectApi["endpoints"][number];

interface ApiEndpointsTableProps {
  api: ProjectApi;
  projectId: string;
}

const endpointPricePattern = /^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

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

export function ApiEndpointsTable({
  api,
  projectId,
}: ApiEndpointsTableProps) {
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

  const endpointRows = useMemo(
    () =>
      api.endpoints.map((endpoint) => {
        const draftPrice = pricesByEndpointId[endpoint.id] ?? "";
        const hasChanged = draftPrice !== (endpoint.priceUsdc ?? "");
        const isValidPrice =
          draftPrice.length > 0 && endpointPricePattern.test(draftPrice);

        return {
          endpoint,
          draftPrice,
          hasChanged,
          isValidPrice,
        };
      }),
    [api.endpoints, pricesByEndpointId]
  );

  const saveEndpointPrice = (endpoint: ProjectEndpoint, draftPrice: string) => {
    if (!endpointPricePattern.test(draftPrice)) {
      toast.error("Price must look like $0.001");
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
            <CardTitle>{api.name}</CardTitle>
            <CardDescription>{api.baseUrl}</CardDescription>
          </div>
          <div className="text-muted-foreground text-xs">
            Imported {format(new Date(api.createdAt), "MMM d, yyyy 'at' h:mm a")}
          </div>
        </div>
        <CardDescription>
          Configure a per-endpoint USDC price for each route parsed from the
          uploaded OpenAPI spec.
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
            {endpointRows.map(({ endpoint, draftPrice, hasChanged, isValidPrice }) => (
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
                  {endpoint.path}
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
                    {draftPrice && !isValidPrice ? (
                      <p className="text-destructive text-xs">
                        Use a value like $0.001
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
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
