import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import Loader from "@/components/loader";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/projects/")({
  component: ProjectsPage,
  head: () =>
    buildSeoHead({
      title: "Projects | Zapx",
      description: "Manage your API projects and endpoints.",
      path: "/projects",
      noIndex: true,
    }),
});

function ProjectsPage() {
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      setDeleteTarget(null);
    },
  });

  if (isLoading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          New Project
        </Button>
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={() =>
                setEditProject({
                  id: project.id,
                  name: project.name,
                  description: project.description,
                })
              }
              onDelete={() =>
                setDeleteTarget({ id: project.id, name: project.name })
              }
            />
          ))}
        </div>
      ) : (
        <Empty className="min-h-[400px] border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanban />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Get started by creating your first project to group and monetize
              your APIs.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              Create your first project
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Create dialog */}
      <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Edit dialog */}
      <ProjectDialog
        open={!!editProject}
        onOpenChange={(open) => {
          if (!open) setEditProject(null);
        }}
        project={editProject}
      />

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteProjectDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          projectName={deleteTarget.name}
          onConfirm={() => deleteMutation.mutate({ id: deleteTarget.id })}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardHeader>
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="hover:underline underline-offset-2"
        >
          <CardTitle>{project.name}</CardTitle>
        </Link>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5 mr-1.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-3.5 mr-1.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
        <CardDescription className="line-clamp-2">
          {project.description || "No description"}
        </CardDescription>
        <CardDescription className="text-xs">
          Updated{" "}
          {formatDistanceToNow(new Date(project.updatedAt), {
            addSuffix: true,
          })}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
