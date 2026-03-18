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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/utils/trpc";

interface ApiUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

const acceptedSpecTypes = ".json,.yaml,.yml,application/json,text/yaml";
const endpointPricePattern = /^\$(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

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
      !endpointPricePattern.test(defaultPriceUsdc.trim())
    ) {
      toast.error("Default price must look like $0.001");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                placeholder="Defaults to the spec title"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
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
                placeholder="https://api.example.com"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                maxLength={500}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="openapi-file">OpenAPI File</Label>
              <Input
                id="openapi-file"
                type="file"
                accept={acceptedSpecTypes}
                onChange={handleFileUpload}
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
                placeholder="$0.001"
                value={defaultPriceUsdc}
                onChange={(event) => setDefaultPriceUsdc(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                If provided, every parsed endpoint starts with this price and can
                still be edited later.
              </p>
              {defaultPriceUsdc && !endpointPricePattern.test(defaultPriceUsdc) ? (
                <p className="text-destructive text-xs">
                  Use a value like $0.001
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="openapi-spec">OpenAPI Spec</Label>
              <Textarea
                id="openapi-spec"
                placeholder="Paste your OpenAPI JSON or YAML here..."
                value={openapiSpec}
                onChange={(event) => setOpenapiSpec(event.target.value)}
                rows={16}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createApiMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createApiMutation.isPending || !openapiSpec.trim()}
            >
              {createApiMutation.isPending ? "Importing..." : "Import API"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
