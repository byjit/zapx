import { randomBytes } from "node:crypto";
import type { Express } from "express";
import {
  type FacilitatorStub,
  startFacilitatorStub,
  TEST_NETWORK,
  TEST_PAY_TO,
} from "./facilitator-stub";
import { startUpstreamStub, type UpstreamStub } from "./upstream-stub";

/** Fee percentage the paid-path assertions are calibrated against (P1-1). */
export const TEST_PLATFORM_FEE_PERCENT = "2.5";

type AppModule = typeof import("../../app");
type DbModule = typeof import("@turborepo-boilerplate/db");
type LedgerModule = typeof import("../../services/ledger");
type UserSchema = typeof import("@turborepo-boilerplate/db/schema/auth");
type ProjectSchema = typeof import("@turborepo-boilerplate/db/schema/project");
type ProviderApiSchema =
  typeof import("@turborepo-boilerplate/db/schema/provider-api");
type ProviderEndpointSchema =
  typeof import("@turborepo-boilerplate/db/schema/provider-endpoint");
type LedgerEntrySchema =
  typeof import("@turborepo-boilerplate/db/schema/ledger-entry");
type PaymentReceiptSchema =
  typeof import("@turborepo-boilerplate/db/schema/payment-receipt");
type UserBalanceSchema =
  typeof import("@turborepo-boilerplate/db/schema/user-balance");

export type EndpointSeed = {
  method: string;
  path: string;
  /** `null` reproduces an endpoint imported from a spec but never priced. */
  priceUsdc: string | null;
  summary?: string;
};

export type ApiFixture = {
  userId: string;
  projectId: string;
  apiId: string;
  endpointIds: Record<string, string>;
};

export type GatewayHarness = Awaited<ReturnType<typeof startGatewayHarness>>;

/**
 * The migration that adds everything the paid request path writes.
 *
 * It is generated but deliberately unapplied, so a database that predates it
 * cannot store a payment reservation at all. Tests that need it are skipped
 * rather than failed — see `pendingMigrationReason`.
 */
const PENDING_MIGRATION =
  "packages/db/src/migrations/0003_glossy_nightmare.sql";

/**
 * Columns and constraints introduced by {@link PENDING_MIGRATION} that the
 * gateway's reservation and ledger writes depend on.
 */
const REQUIRED_RECEIPT_COLUMNS = ["user_id", "api_id", "endpoint_id"];

/**
 * Boots the gateway against local stubs.
 *
 * Order matters: `@turborepo-boilerplate/env` parses `process.env` the first
 * time it is imported, so the stub facilitator has to be listening and its URL
 * exported *before* anything that transitively reaches it is loaded. Every
 * application module is therefore pulled in with a dynamic `import()` here,
 * never a static top-level one.
 */
export async function startGatewayHarness() {
  const facilitator = await startFacilitatorStub();
  const upstream = await startUpstreamStub();

  process.env.FACILITATOR_URL = facilitator.url;
  process.env.PAY_TO = TEST_PAY_TO;
  process.env.X402_NETWORK = TEST_NETWORK;
  process.env.PLATFORM_FEE_PERCENT = TEST_PLATFORM_FEE_PERCENT;
  // Keep app construction cheap and the rate limiter process-local.
  process.env.ALLOW_OPENAPI = "false";
  process.env.RATE_LIMIT_MODE = "memory";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= "test-google-key";

  const [
    app,
    dbModule,
    ledger,
    authSchema,
    projectSchema,
    providerApiSchema,
    providerEndpointSchema,
    ledgerEntrySchema,
    paymentReceiptSchema,
    userBalanceSchema,
    drizzle,
  ] = await Promise.all([
    import("../../app") as Promise<AppModule>,
    import("@turborepo-boilerplate/db") as Promise<DbModule>,
    import("../../services/ledger") as Promise<LedgerModule>,
    import("@turborepo-boilerplate/db/schema/auth") as Promise<UserSchema>,
    import(
      "@turborepo-boilerplate/db/schema/project"
    ) as Promise<ProjectSchema>,
    import(
      "@turborepo-boilerplate/db/schema/provider-api"
    ) as Promise<ProviderApiSchema>,
    import(
      "@turborepo-boilerplate/db/schema/provider-endpoint"
    ) as Promise<ProviderEndpointSchema>,
    import(
      "@turborepo-boilerplate/db/schema/ledger-entry"
    ) as Promise<LedgerEntrySchema>,
    import(
      "@turborepo-boilerplate/db/schema/payment-receipt"
    ) as Promise<PaymentReceiptSchema>,
    import(
      "@turborepo-boilerplate/db/schema/user-balance"
    ) as Promise<UserBalanceSchema>,
    import("drizzle-orm"),
  ]);

  const { db } = dbModule;
  const { eq, inArray, sql } = drizzle;

  /** Unique per run, so parallel runs and leftovers never collide. */
  const runTag = randomBytes(20).toString("hex");
  const createdUserIds: string[] = [];
  const createdApiIds: string[] = [];
  const createdProjectIds: string[] = [];

  const missingReceiptColumns = await findMissingReceiptColumns();

  async function findMissingReceiptColumns(): Promise<string[]> {
    const result = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_schema = current_schema() and table_name = 'payment_receipt'`
    );
    const present = new Set(result.rows.map((row) => row.column_name));
    return REQUIRED_RECEIPT_COLUMNS.filter((column) => !present.has(column));
  }

  const pendingMigrationReason =
    missingReceiptColumns.length === 0
      ? null
      : `DATABASE_URL is behind ${PENDING_MIGRATION}: payment_receipt is missing ${missingReceiptColumns.join(", ")}, so the gateway cannot reserve a payment. Apply that migration to run the paid-path tests.`;

  async function createApiFixture(options: {
    baseUrl: string;
    endpoints: EndpointSeed[];
    ownerBanned?: boolean;
  }): Promise<ApiFixture> {
    const suffix = randomBytes(8).toString("hex");
    const userId = `zapx-test-user-${runTag}-${suffix}`;
    const projectId = `zapx-test-project-${runTag}-${suffix}`;
    const apiId = `zapx-test-api-${runTag}-${suffix}`;
    const now = new Date();

    await db.insert(authSchema.user).values({
      id: userId,
      name: "Zapx Test Provider",
      email: `${userId}@example.test`,
      emailVerified: true,
      banned: options.ownerBanned ?? false,
      createdAt: now,
      updatedAt: now,
    });
    createdUserIds.push(userId);

    await db
      .insert(projectSchema.project)
      .values({ id: projectId, userId, name: "Zapx Test Project" });
    createdProjectIds.push(projectId);

    await db.insert(providerApiSchema.providerApi).values({
      id: apiId,
      userId,
      projectId,
      name: "Zapx Test API",
      baseUrl: options.baseUrl,
      openapiSpec: "{}",
      specVersion: "3.0.0",
    });
    createdApiIds.push(apiId);

    const endpointIds: Record<string, string> = {};
    for (const [index, endpoint] of options.endpoints.entries()) {
      const endpointId = `zapx-test-endpoint-${runTag}-${suffix}-${index}`;
      await db.insert(providerEndpointSchema.providerEndpoint).values({
        id: endpointId,
        userId,
        apiId,
        method: endpoint.method.toUpperCase(),
        path: endpoint.path,
        priceUsdc: endpoint.priceUsdc,
        summary: endpoint.summary,
      });
      endpointIds[`${endpoint.method.toUpperCase()} ${endpoint.path}`] =
        endpointId;
    }

    return { userId, projectId, apiId, endpointIds };
  }

  /**
   * Removes every row this run created, children first.
   *
   * The ledger and receipt references are `ON DELETE RESTRICT` precisely so
   * committed money history cannot be erased by a delete elsewhere, which means
   * the order below is load-bearing rather than cosmetic.
   */
  async function cleanup(): Promise<void> {
    if (createdUserIds.length > 0) {
      await db
        .delete(ledgerEntrySchema.ledgerEntry)
        .where(inArray(ledgerEntrySchema.ledgerEntry.userId, createdUserIds));
    }

    // Reservation keys always embed the run tag (payer address or explicit id),
    // so this catches gateway-created and hand-seeded receipts alike.
    await db.execute(
      sql`delete from payment_receipt where payment_id like ${`%${runTag}%`}`
    );

    if (createdUserIds.length > 0) {
      await db
        .delete(userBalanceSchema.userBalance)
        .where(inArray(userBalanceSchema.userBalance.userId, createdUserIds));
      await db
        .delete(providerEndpointSchema.providerEndpoint)
        .where(
          inArray(
            providerEndpointSchema.providerEndpoint.userId,
            createdUserIds
          )
        );
    }
    if (createdApiIds.length > 0) {
      await db
        .delete(providerApiSchema.providerApi)
        .where(inArray(providerApiSchema.providerApi.id, createdApiIds));
    }
    if (createdProjectIds.length > 0) {
      await db
        .delete(projectSchema.project)
        .where(inArray(projectSchema.project.id, createdProjectIds));
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(authSchema.user)
        .where(inArray(authSchema.user.id, createdUserIds));
    }

    createdUserIds.length = 0;
    createdApiIds.length = 0;
    createdProjectIds.length = 0;
  }

  return {
    facilitator: facilitator as FacilitatorStub,
    upstream: upstream as UpstreamStub,
    db,
    sql,
    eq,
    inArray,
    ledger,
    schema: {
      user: authSchema.user,
      project: projectSchema.project,
      providerApi: providerApiSchema.providerApi,
      providerEndpoint: providerEndpointSchema.providerEndpoint,
      ledgerEntry: ledgerEntrySchema.ledgerEntry,
      paymentReceipt: paymentReceiptSchema.paymentReceipt,
      userBalance: userBalanceSchema.userBalance,
    },
    runTag,
    /** Non-null when the database predates the reservation columns. */
    pendingMigrationReason,
    /** A fresh app per test keeps the per-IP rate limiter from bleeding across cases. */
    createApp: (): Express => app.createServer(),
    createApiFixture,
    cleanup,
    async close(): Promise<void> {
      await cleanup();
      await facilitator.close();
      await upstream.close();
      await (
        db as unknown as { $client: { end(): Promise<void> } }
      ).$client.end();
    },
  };
}
