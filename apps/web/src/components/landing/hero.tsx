import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Hero() {
  return (
    <section className="mb-20 flex flex-col justify-center items-center gap-6 text-center">
      <h1 className="text-5xl font-normal tracking-tight">
        The best template, <br />
        for you
      </h1>

      <p className="max-w-lg text-muted-foreground leading-relaxed">
        Build super fast, optimized Next.js applications with this boilerplate,
        featuring TypeScript, Tailwind CSS, and tRPC integration.
      </p>

      <div className="flex items-center gap-4">
        <a href={"/login"}>
          <Button className="rounded-full" size={"lg"}>
            Get started
            <ArrowRight />
          </Button>
        </a>
      </div>
    </section>
  );
}
