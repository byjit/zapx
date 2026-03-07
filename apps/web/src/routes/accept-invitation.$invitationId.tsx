import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isPending: isSessionLoading } =
    authClient.useSession();
  const [invitationStatus, setInvitationStatus] = useState<
    "idle" | "accepting" | "error" | "success"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAccept = async () => {
    setInvitationStatus("accepting");
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    });

    if (error) {
      setInvitationStatus("error");
      setErrorMsg(error.message || "Failed to accept invitation");
      toast.error(error.message || "Failed to accept invitation");
    } else {
      setInvitationStatus("success");
      toast.success("Invitation accepted successfully");
      navigate({ to: "/settings" });
    }
  };

  if (isSessionLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Organization Invitation</CardTitle>
          <CardDescription>
            You have been invited to join an organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitationStatus === "error" && (
            <div className="mb-4 text-center text-sm text-red-500">
              {errorMsg}
            </div>
          )}
          {!session ? (
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Please sign in to accept this invitation.
              </p>
              <Button
                className="w-full"
                onClick={() =>
                  navigate({
                    to: "/login",
                    search: { callbackURL: window.location.href },
                  } as any)
                }
              >
                Sign In
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                You are signed in as <strong>{session.user.email}</strong>.
              </p>
              <Button
                className="w-full"
                disabled={
                  invitationStatus === "accepting" ||
                  invitationStatus === "success"
                }
                onClick={handleAccept}
              >
                {invitationStatus === "accepting"
                  ? "Accepting..."
                  : "Accept Invitation"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
