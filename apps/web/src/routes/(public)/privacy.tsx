import { createFileRoute, Link } from "@tanstack/react-router";
import { allPosts } from "content-collections";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/(public)/privacy")({
  component: PrivacyPolicy,
  head: () =>
    buildSeoHead({
      title: "Privacy Policy | Turborepo Boilerplate",
      description:
        "Privacy Policy for Turborepo Boilerplate. Learn how we collect, use, and protect your personal information.",
      path: "/privacy",
      type: "article",
    }),
});

function PrivacyPolicy() {
  const post = allPosts.find((p) => p.slug === "privacy-policy");

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
        <div className="text-muted-foreground mb-8">
          <time>{post.date}</time>
        </div>
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </div>
  );
}
