import type { ReactNode } from "react";

interface BulletProps {
  children: ReactNode;
}

function Bullet({ children }: BulletProps) {
  return (
    <li className="flex gap-3 leading-relaxed">
      <span className="text-muted-foreground shrink-0">&rarr;</span>
      <span>{children}</span>
    </li>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="py-10">
      <h2 className="text-sm font-semibold mb-6">{title}</h2>
      <ul className="space-y-4 text-sm max-w-lg">{children}</ul>
    </div>
  );
}

export function HowItWorks() {
  return (
    <Section title="How it works">
      <Bullet>
        Developer uploads an OpenAPI spec and sets per-endpoint pricing.
      </Bullet>
      <Bullet>
        Platform generates <strong>x402-enabled gateway endpoints</strong>{" "}
        automatically.
      </Bullet>
      <Bullet>
        Clients pay with USDC per request &mdash;{" "}
        <strong>gasless, off-chain signatures</strong>.
      </Bullet>
      <Bullet>
        Payments are verified and settled via the x402 facilitator.
      </Bullet>
      <Bullet>
        Earnings are tracked in an <strong>internal ledger</strong> and
        available for withdrawal at any time.
      </Bullet>
    </Section>
  );
}

export function BuiltForMachines() {
  return (
    <Section title="Built for machines">
      <Bullet>AI agents purchase APIs autonomously.</Bullet>
      <Bullet>
        <strong>Machine-to-machine payments</strong> become native to the web.
      </Bullet>
      <Bullet>
        Data marketplaces, model inference, compute services &mdash; all
        pay-per-use.
      </Bullet>
      <Bullet>
        The payment layer disappears into the protocol.{" "}
        <em>If you need it, it&rsquo;s already there.</em>
      </Bullet>
    </Section>
  );
}

export function Infrastructure() {
  return (
    <Section title="Infrastructure">
      <Bullet>
        <strong>HTTP 402 Payment Required</strong> &mdash; the payment protocol
        is native to the web.
      </Bullet>
      <Bullet>USDC on Base &mdash; low fees, fast settlement.</Bullet>
      <Bullet>
        Custodial aggregation &mdash; no wallet management for developers.
      </Bullet>
      <Bullet>
        Replay protection, idempotency, and fraud detection built in.
      </Bullet>
    </Section>
  );
}

export function GetStarted() {
  return (
    <div className="py-10">
      <h2 className="text-sm font-semibold mb-6">Get started</h2>
      <ul className="space-y-4 text-sm max-w-lg">
        <Bullet>
          <a
            className="underline underline-offset-4 hover:text-foreground transition-colors"
            href="/login"
          >
            Sign up
          </a>{" "}
          and create your first project.
        </Bullet>
        <Bullet>
          Upload an OpenAPI spec, set your prices, and start earning.
        </Bullet>
      </ul>
    </div>
  );
}
