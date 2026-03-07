import { createFileRoute, Link } from "@tanstack/react-router";
import { allPosts } from "content-collections";
import { buildSeoHead } from "@/lib/seo";

const BLOG_KEYWORDS = [
  "turborepo tutorials",
  "fullstack development",
  "react best practices",
  "typescript tips",
  "web development blog",
];

export const Route = createFileRoute("/(public)/blog/")({
  component: BlogIndex,
  head: () =>
    buildSeoHead({
      title: "Blog | Turborepo Boilerplate",
      description:
        "Latest tutorials, insights, and best practices for building modern web applications with Turborepo, React, and TypeScript.",
      path: "/blog",
      keywords: BLOG_KEYWORDS,
      type: "blog",
    }),
});

function BlogIndex() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Blog</h1>
      <div className="grid gap-4">
        {allPosts.map((post) => (
          <div className="border p-4 rounded-lg" key={post._meta.path}>
            <Link
              className="text-xl font-semibold hover:underline"
              params={{ slug: post.slug }}
              to="/blog/$slug"
            >
              {post.title}
            </Link>
            <p className="text-muted-foreground text-sm">{post.date}</p>
            <p className="mt-2">{post.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
