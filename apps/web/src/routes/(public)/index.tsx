import { createFileRoute } from "@tanstack/react-router";
import Footer from "@/components/landing/footer";
import { Gallery } from "@/components/landing/gallery";
import Hero from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import { buildCanonicalUrl, buildSeoHead, seoConstants } from "@/lib/seo";

const LANDING_KEYWORDS = [
  "turborepo starter",
  "fullstack boilerplate",
  "react ai template",
  "typescript monorepo",
];

export const Route = createFileRoute("/(public)/")({
  component: Landing,
  head: () =>
    buildSeoHead({
      title: `${seoConstants.SITE_NAME} | Ship SaaS faster with an AI-ready Turborepo`,
      description:
        "Jumpstart your next SaaS with an opinionated Turborepo starter featuring authentication, payments, AI chat, and DX tooling out of the box.",
      path: "/",
      image: "/og-image.png",
      keywords: [
        ...LANDING_KEYWORDS,
        "turborepo boilerplate",
        "saas starter kit",
        "better auth",
      ],
      structuredData: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: seoConstants.SITE_NAME,
        description:
          "Production-ready Turborepo boilerplate with AI, auth, billing, and modern tooling.",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Any",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        url: buildCanonicalUrl("/"),
        author: {
          "@type": "Person",
          name: "Prasanjit Dutta",
        },
        sameAs: [
          "https://x.com/jit_infinity",
          "https://www.linkedin.com/in/prasanjit-dutta-82004b18b/",
        ],
      },
    }),
});

function Landing() {
  return (
    <div className="min-h-screen max-w-5xl mx-auto font-sans">
      <Nav />
      <main className="py-20 md:py-32">
        <Hero />
        <Gallery />
      </main>
      <Footer />
    </div>
  );
}
