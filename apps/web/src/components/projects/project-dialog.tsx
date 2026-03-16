import { useEffect, useState } from "react";
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

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog acts as an edit form */
  project?: { id: string; name: string; description: string | null } | null;
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
}: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const isEditing = !!project;
  const utils = trpc.useUtils();

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
    } else {
      setName("");
      setDescription("");
    }
  }, [project, open]);

  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      onOpenChange(false);
    },
  });

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      if (project) utils.project.getById.invalidate({ id: project.id });
      onOpenChange(false);
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEditing && project) {
      updateMutation.mutate({
        id: project.id,
        data: {
          name: name.trim(),
          description: description.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Project" : "New Project"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update your project details."
                : "Create a new project to group your APIs."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Weather APIs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-description">
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="project-description"
                placeholder="A brief description of what this project does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
              />
            </div>
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
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                  ? "Save Changes"
                  : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
