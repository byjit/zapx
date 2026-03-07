import { Link, useRouter } from "@tanstack/react-router";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "../ui/button";

export default function GlobalError({ error }: { error: Error }) {
  const router = useRouter();
  console.log("Global Error:", error);

  const reset = () => {
    router.invalidate();
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="select-none text-[150px] font-black leading-none text-neutral-200 dark:text-neutral-800 sm:text-[200px]">
        500
      </h1>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
        Something went wrong
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
        {error.message}
      </p>
      <p className="my-8 max-w-lg text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
        If problems persist please feel free to contact us using the link below
      </p>
      <div className="mt-8 flex items-center justify-center gap-2">
        <Button
          className="tracking-wider underline"
          onClick={reset}
          variant="link"
        >
          Try again
        </Button>
        <Link
          className={cn(
            buttonVariants({
              variant: "link",
              className: "tracking-wider underline",
            })
          )}
          to="/"
        >
          Contact Us
        </Link>
      </div>
    </div>
  );
}
