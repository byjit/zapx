import { createFileRoute } from "@tanstack/react-router";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import {
  BuiltForMachines,
  GetStarted,
  HowItWorks,
  Infrastructure,
} from "@/components/landing/sections";
import { Separator } from "@/components/ui/separator";
import { buildCanonicalUrl, buildSeoHead, seoConstants } from "@/lib/seo";

const LANDING_KEYWORDS = [
  "api monetization",
  "pay per request",
  "x402 protocol",
  "usdc payments",
  "api gateway",
];

export const Route = createFileRoute("/(public)/")({
  component: Landing,
  head: () =>
    buildSeoHead({
      title: `${seoConstants.SITE_NAME} | Monetize APIs with instant payments`,
      description:
        "Turn any API into a pay-per-request service using the x402 protocol. No subscriptions, no API keys — just instant USDC payments.",
      path: "/",
      image: "/og-image.png",
      keywords: [
        ...LANDING_KEYWORDS,
        "machine payments",
        "api marketplace",
        "stablecoin",
      ],
      structuredData: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: seoConstants.SITE_NAME,
        description:
          "Pay-per-request API gateway using the x402 payment protocol with custodial aggregation.",
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
      },
    }),
});

function Landing() {
  return (
    <div className="min-h-screen max-w-xl mx-auto px-6 font-sans antialiased">
      <Nav />
      <main>
        <Hero />
        <Separator />
        <HowItWorks />
        <Separator />
        <BuiltForMachines />
        <Separator />
        <Infrastructure />
        <Separator />
        <GetStarted />
      </main>
      <Footer />
    </div>
  );
}
