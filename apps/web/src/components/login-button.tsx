import { ArrowRight } from "lucide-react";
import { env } from "@/env";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

type LoginButtonProps = {
  text: string;
  showArrow?: boolean;
  className?: string;
};

export function LoginButton({
  text = "Sign up",
  showArrow = false,
  className,
}: LoginButtonProps) {
  const signIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${env.SITE_URL}/dashboard`,
    });
  };
  return (
    <Button
      className={cn("hover:cursor-pointer ", className)}
      onClick={() => signIn()}
    >
      <span className="btn-label">{text}</span>
      {showArrow && <ArrowRight />}
    </Button>
  );
}
