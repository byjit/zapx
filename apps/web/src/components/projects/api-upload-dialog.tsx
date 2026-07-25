import {
  ENDPOINT_PRICE_HINT,
  isValidEndpointPrice,
} from "@turborepo-boilerplate/api/pricing";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/utils/trpc";

interface ApiUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

const acceptedSpecTypes = ".json,.yaml,.yml,application/json,text/yaml";

export function ApiUploadDialog({
  open,
  onOpenChange,
  projectId,
}: ApiUploadDialogProps) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultPriceUsdc, setDefaultPriceUsdc] = useState("");
  const [openapiSpec, setOpenapiSpec] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setBaseUrl("");
      setDefaultPriceUsdc("");
      setOpenapiSpec("");
      setSelectedFileName(null);
    }
  }, [open]);

  const createApiMutation = trpc.api.create.useMutation({
    onSuccess: () => {
      toast.success("API imported successfully");
      utils.api.listByProject.invalidate({ projectId });
      utils.project.getById.invalidate({ id: projectId });
      utils.project.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const fileContents = await file.text();
      setOpenapiSpec(fileContents);
      setSelectedFileName(file.name);

      if (!name.trim()) {
        const inferredName = file.name.replace(/\.(json|ya?ml)$/i, "");
        setName(inferredName);
      }
    } catch {
      toast.error("Failed to read the selected file");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      defaultPriceUsdc.trim() &&
      !isValidEndpointPrice(defaultPriceUsdc.trim())
    ) {
      toast.error(ENDPOINT_PRICE_HINT);
      return;
    }

    createApiMutation.mutate({
      projectId,
      name: name.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      defaultPriceUsdc: defaultPriceUsdc.trim() || undefined,
      openapiSpec: openapiSpec.trim(),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upload OpenAPI Spec</DialogTitle>
            <DialogDescription>
              Import an OpenAPI JSON or YAML file to create endpoints for this
              project. You can override the base URL if your deployed API lives
              elsewhere.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="api-name">
                API Name{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="api-name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Defaults to the spec title"
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="api-base-url">
                Base URL{" "}
                <span className="text-muted-foreground font-normal">
                  (optional if defined in the spec)
                </span>
              </Label>
              <Input
                id="api-base-url"
                maxLength={500}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com"
                value={baseUrl}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="openapi-file">OpenAPI File</Label>
              <Input
                accept={acceptedSpecTypes}
                id="openapi-file"
                onChange={handleFileUpload}
                type="file"
              />
              <p className="text-muted-foreground text-xs">
                {selectedFileName
                  ? `Loaded ${selectedFileName}`
                  : "Upload a JSON or YAML OpenAPI spec file."}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="default-price">
                Default Endpoint Price{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="default-price"
                onChange={(event) => setDefaultPriceUsdc(event.target.value)}
                placeholder="$0.001"
                value={defaultPriceUsdc}
              />
              <p className="text-muted-foreground text-xs">
                If provided, every parsed endpoint starts with this price and
                can still be edited later.
              </p>
              {defaultPriceUsdc && !isValidEndpointPrice(defaultPriceUsdc) ? (
                <p className="text-destructive text-xs">
                  {ENDPOINT_PRICE_HINT}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={createApiMutation.isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={createApiMutation.isPending || !openapiSpec.trim()}
              type="submit"
            >
              {createApiMutation.isPending ? "Importing..." : "Import API"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
