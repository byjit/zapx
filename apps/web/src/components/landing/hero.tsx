import { LoginButton } from "../login-button";

export default function Hero() {
  return (
    <section className="pt-16 pb-12 md:pt-24 md:pb-16 space-y-6">
      <h1 className="text-4xl md:text-5xl leading-tight tracking-tight">
        Monetize APIs
        <br />
        with instant payments
      </h1>
      <p className="max-w-md text-muted-foreground leading-relaxed">
        Turn any API into a pay-per-request service using the x402 protocol. No
        subscriptions. No API keys. Just instant USDC payments.
      </p>
      <LoginButton text="Start now" showArrow />
    </section>
  );
}
