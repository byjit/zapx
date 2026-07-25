import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import Loader from "@/components/loader";
import { ApiEndpointsTable } from "@/components/projects/api-endpoints-table";
import { ApiUploadDialog } from "@/components/projects/api-upload-dialog";
import { DeleteProjectDialog } from "@/components/projects/delete-project-dialog";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/projects/$projectId")({
  component: ProjectDetailPage,
  head: () =>
    buildSeoHead({
      title: "Project | Zapx",
      description: "View and manage your project.",
      path: "/projects",
      noIndex: true,
    }),
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: project, isLoading } = trpc.project.getById.useQuery({
    id: projectId,
  });
  const { data: apis, isLoading: isApisLoading } =
    trpc.api.listByProject.useQuery(
      {
        projectId,
      },
      {
        enabled: !!project,
      }
    );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      navigate({ to: "/projects" });
    },
  });

  if (isLoading) return <Loader />;

  if (!project) {
    return (
      <div className="space-y-4">
        <Link to="/projects">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="size-3.5" />
            Back to projects
          </Button>
        </Link>
        <Empty className="min-h-[300px] border">
          <EmptyHeader>
            <EmptyTitle>Project not found</EmptyTitle>
            <EmptyDescription>
              This project may have been deleted or you don't have access.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/projects">
              <Button variant="outline">Go to Projects</Button>
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link to="/projects">
              <Button variant="ghost" size="icon-sm">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">
              {project.name}
            </h1>
          </div>
          {project.description && (
            <p className="text-muted-foreground ml-9">{project.description}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5 mr-1.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator />

      {/* APIs section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">APIs & Endpoint Pricing</h2>
            <p className="text-muted-foreground text-sm">
              Import an OpenAPI spec and assign a USDC price to each endpoint.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Plus className="size-4" />
            Upload OpenAPI Spec
          </Button>
        </div>
        {isApisLoading ? (
          <Loader />
        ) : apis && apis.length > 0 ? (
          <div className="space-y-4">
            {apis.map((api) => (
              <ApiEndpointsTable key={api.id} api={api} projectId={projectId} />
            ))}
          </div>
        ) : (
          <Empty className="min-h-[200px] border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="M4 12h16" />
                  <path d="M4 6h16" />
                  <path d="M4 18h16" />
                </svg>
              </EmptyMedia>
              <EmptyTitle>No APIs registered</EmptyTitle>
              <EmptyDescription>
                Upload an OpenAPI spec to register your first API and configure
                endpoint pricing.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => setUploadOpen(true)}>
                Upload OpenAPI Spec
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>

      <ApiUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectId={projectId}
      />

      {/* Edit dialog */}
      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
      />

      {/* Delete dialog */}
      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectName={project.name}
        onConfirm={() => deleteMutation.mutate({ id: project.id })}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
