import { useState } from "react";
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

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  projectName,
  onConfirm,
  isPending,
}: DeleteProjectDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const canDelete = confirmText === projectName;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setConfirmText("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone. All APIs and endpoints
            within this project will also be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Label htmlFor="confirm-delete">
            Type <span className="font-semibold">{projectName}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            placeholder={projectName}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canDelete || isPending}
            onClick={onConfirm}
          >
            {isPending ? "Deleting..." : "Delete Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
