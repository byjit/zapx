import { Link } from "@tanstack/react-router";
import { Button } from "../ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="select-none text-[150px] leading-none text-neutral-200 dark:text-neutral-500 sm:text-[200px]">
        404
      </h1>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
        Oops! This Page Could Not Be Found
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
        Sorry but the page you are looking for does not exist or have been
        removed.
      </p>
      <div className="mt-8">
        <Button asChild className="tracking-wider underline" variant={"link"}>
          <Link to="/">Go to homepage</Link>
        </Button>
      </div>
    </div>
  );
}
