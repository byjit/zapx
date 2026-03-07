import { createFileRoute, Link } from "@tanstack/react-router";
import { allPosts } from "content-collections";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/(public)/about")({
  component: AboutPage,
  head: () =>
    buildSeoHead({
      title: "About | Turborepo Boilerplate",
      description:
        "Learn about Turborepo Boilerplate - a production-ready starter template for building modern SaaS applications with React, TanStack Router, and AI integrations.",
      path: "/about",
      type: "article",
      keywords: [
        "about turborepo boilerplate",
        "fullstack starter template",
        "react saas boilerplate",
        "tanstack router starter",
      ],
    }),
});

function AboutPage() {
  const post = allPosts.find((p) => p.slug === "about");

  if (!post) {
    return (
      <div className="container mx-auto py-10 px-4">
        <p className="text-muted-foreground">Page not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <Link
        className="text-muted-foreground hover:text-foreground mb-4 block"
        to="/"
      >
        &larr; Back to Home
      </Link>
      <article className="prose dark:prose-invert max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">{post.title}</h1>
        <div className="text-muted-foreground mb-8 flex items-center gap-4">
          <time>{post.date}</time>
          {post.author && <span>· by {post.author}</span>}
        </div>
        {post.image && (
          <img
            alt={post.title}
            className="w-full h-auto rounded-lg mb-8"
            loading="lazy"
            src={post.image}
          />
        )}
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </div>
  );
}
