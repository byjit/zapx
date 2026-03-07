import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginButton } from "@/components/login-button";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { buildSeoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/(public)/login")({
  component: LoginPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session.data) {
      redirect({
        to: "/dashboard",
        throw: true,
      });
    }
  },
  head: () =>
    buildSeoHead({
      title: "Sign in | Turborepo Boilerplate",
      description:
        "Access your Turborepo Boilerplate account securely with Google sign-in.",
      path: "/login",
    }),
});

function LoginPage() {
  return (
    <div className="flex w-full min-h-screen flex-col justify-center items-center p-8 md:p-12 lg:p-16 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-2 mb-8">
          <Logo showText />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Welcome. You are just one click away from unlocking new productivity
            for your business!
          </p>
        </div>

        <div className="space-y-4">
          <LoginButton
            className={cn(buttonVariants({ size: "lg" }))}
            showArrow
            text="Sign in with Google"
          />
        </div>
      </div>
    </div>
  );
}
