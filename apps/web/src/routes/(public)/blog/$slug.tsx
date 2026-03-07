import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { allPosts } from "content-collections";
import { buildSeoHead, getSiteUrl } from "@/lib/seo";

export const Route = createFileRoute("/(public)/blog/$slug")({
  component: BlogPost,
  loader: ({ params }) => {
    const post = allPosts.find((p) => p.slug === params.slug);
    if (!post) {
      throw notFound();
    }
    return { post };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return buildSeoHead({
        title: "Blog Post | Turborepo Boilerplate",
        noIndex: true,
      });
    }

    const { post } = loaderData;
    const siteUrl = getSiteUrl();
    const postUrl = `${siteUrl}/blog/${post.slug}`;
    const imageUrl = post.image
      ? post.image.startsWith("http")
        ? post.image
        : `${siteUrl}${post.image}`
      : `${siteUrl}/og-image.png`;

    return buildSeoHead({
      title: `${post.title} | Blog`,
      description: post.summary,
      path: `/blog/${post.slug}`,
      type: "article",
      keywords: post.tags || [],
      structuredData: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.summary,
        datePublished: post.date,
        dateModified: post.updatedAt || post.date,
        url: postUrl,
        image: imageUrl,
        author: {
          "@type": "Person",
          name: post.author || "Prasanjit Dutta",
        },
        publisher: {
          "@type": "Organization",
          name: "Turborepo Boilerplate",
          logo: {
            "@type": "ImageObject",
            url: `${siteUrl}/logo.png`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": postUrl,
        },
      },
    });
  },
});

function BlogPost() {
  const { post } = Route.useLoaderData();

  return (
    <div className="container mx-auto py-10 px-4">
      <Link
        className="text-muted-foreground hover:text-foreground mb-4 block"
        to="/blog"
      >
        &larr; Back to Blog
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
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown content is sanitized by Content Collections */}
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </div>
  );
}
