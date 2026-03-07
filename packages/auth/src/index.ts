import { checkout, polar, portal } from "@polar-sh/better-auth";
import { db } from "@turborepo-boilerplate/db";
import * as schema from "@turborepo-boilerplate/db/schema/auth";
import {
  resend,
  sendAdminSlackNotification,
  sendOrganizationInvitation,
  WelcomeEmail,
} from "@turborepo-boilerplate/services";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { TestHelpers } from "better-auth/plugins";
import {
  admin as adminPlugin,
  multiSession,
  organization,
  testUtils,
} from "better-auth/plugins";
import { APP_NAME, SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_ID } from "./constant";
import { env } from "./env";
import { polarClient } from "./lib/payments";

export * from "./permissions";

const isTestEnvironment = env.NODE_ENV === "test";
const appOrigin = env.CORS_ORIGIN?.trim() || "http://localhost:3001";
const trustedOrigins = env.CORS_ORIGIN ? [new URL(env.CORS_ORIGIN).origin] : [];
const usesCrossOriginCookies =
  env.NODE_ENV === "production" &&
  new URL(appOrigin).origin !== new URL(env.BETTER_AUTH_URL).origin;

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  trustedOrigins,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  user: {
    additionalFields: {
      metadata: {
        type: "string",
        required: false,
        input: false,
        fieldName: "metadata",
        unique: false,
      },
      onboard: {
        type: "number",
        required: false,
        input: false,
        fieldName: "onboard",
        unique: false,
      },
    },
  },
  advanced: {
    // Split frontend/backend deployments need cross-site cookies in production,
    // while localhost development remains more reliable with Better Auth's
    // same-site defaults.
    defaultCookieAttributes: {
      sameSite: usesCrossOriginCookies ? "none" : "lax",
      secure: env.NODE_ENV === "production",
      httpOnly: true,
    },
    useSecureCookies: env.NODE_ENV === "production",
  },
  plugins: [
    organization({
      // Invitation expires in 48 hours (default)
      invitationExpiresIn: 48 * 60 * 60,
      cancelPendingInvitationsOnReInvite: true,
      async sendInvitationEmail(data) {
        const inviteLink = `${appOrigin}/accept-invitation/${data.id}`;
        await sendOrganizationInvitation({
          email: data.email,
          invitedByUsername: data.inviter.user.name || "A user",
          invitedByEmail: data.inviter.user.email,
          teamName: data.organization.name,
          inviteLink,
        });
      },
    }),
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      enableCustomerPortal: true,
      use: [
        checkout({
          products: [
            {
              productId: env.POLAR_PRO_PRODUCT_ID,
              slug: env.POLAR_PRO_SLUG, // pro
            },
          ],
          successUrl: env.POLAR_SUCCESS_URL,
          authenticatedUsersOnly: true,
        }),
        portal(),
        // usage(),
        // webhooks({
        //   secret: env.POLAR_WEBHOOK_SECRET!,
        //   onCustomerStateChanged: async (payload) => {console.log('Polar webhook | onCustomerStateChanged : ', payload)}, // Triggered when anything regarding a customer changes
        //   onOrderPaid: async (payload) => {console.log('Polar webhook | onOrderPaid : ', payload)}, // Triggered when an order was paid (purchase, subscription renewal, etc.)
        //   onPayload: async (payload) => {console.log('Polar webhook | onPayload : ', payload)} // Catch-all for all events
        // })
      ],
    }),
    multiSession({
      maximumSessions: 2,
    }),
    adminPlugin({
      adminUserIds: [SYSTEM_ADMIN_ID],
      bannedUserMessage:
        "You have been banned from using this application due to unauthorized activity. Please contact Support if you believe there has been a misunderstanding.",
    }),
    ...(isTestEnvironment ? [testUtils({ captureOTP: true })] : []),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user, _) => {
          if (env.NODE_ENV === "production") {
            await sendAdminSlackNotification(
              `${APP_NAME} | New user signed up: ${user.email} at ${user.createdAt}`
            );

            await resend.emails.send({
              from: SYSTEM_ADMIN_EMAIL,
              to: user.email,
              subject: `Welcome to ${APP_NAME}!`,
              react: WelcomeEmail({
                appName: APP_NAME,
                name: user.name ?? "there",
              }),
            });
          }
        },
      },
    },
  },
});

/**
 * Exposes Better Auth test helpers for integration/E2E tests.
 * Throws outside `NODE_ENV=test` to avoid accidental runtime use.
 */
export const getTestHelpers = async (): Promise<TestHelpers> => {
  if (!isTestEnvironment) {
    throw new Error("Better Auth test helpers are only available in test mode");
  }

  const ctx = await auth.$context;

  if (!ctx.test) {
    throw new Error("Better Auth test helpers are not initialized");
  }

  return ctx.test;
};

export const getSession = async (headers: Headers) => {
  return await auth.api.getSession({
    headers,
  });
};
