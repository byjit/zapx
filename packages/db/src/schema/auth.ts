import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import type z from "zod";

export const user = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  onboard: integer("onboard", { mode: "boolean" }).default(true),
  metadata: text("metadata"),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by").references(() => user.id),
  activeOrganizationId: text("active_organization_id"),
});

export const organization = sqliteTable("organization", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  metadata: text("metadata"),
});

export const member = sqliteTable("member", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const invitation = sqliteTable("invitation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const UserSelectSchema = createSelectSchema(user);
export const UserInsertSchema = createInsertSchema(user);
export const UserUpdateSchema = createUpdateSchema(user);

export const SessionSelectSchema = createSelectSchema(session);
export const SessionInsertSchema = createInsertSchema(session);
export const SessionUpdateSchema = createUpdateSchema(session);

export const AccountSelectSchema = createSelectSchema(account);
export const AccountInsertSchema = createInsertSchema(account);
export const AccountUpdateSchema = createUpdateSchema(account);

export const VerificationSelectSchema = createSelectSchema(verification);
export const VerificationInsertSchema = createInsertSchema(verification);
export const VerificationUpdateSchema = createUpdateSchema(verification);

export const OrganizationSelectSchema = createSelectSchema(organization);
export const OrganizationInsertSchema = createInsertSchema(organization);
export const OrganizationUpdateSchema = createUpdateSchema(organization);

export const MemberSelectSchema = createSelectSchema(member);
export const MemberInsertSchema = createInsertSchema(member);
export const MemberUpdateSchema = createUpdateSchema(member);

export const InvitationSelectSchema = createSelectSchema(invitation);
export const InvitationInsertSchema = createInsertSchema(invitation);
export const InvitationUpdateSchema = createUpdateSchema(invitation);

export type User = typeof user;
export type UserInsert = z.infer<typeof UserInsertSchema>;
export type UserUpdate = z.infer<typeof UserUpdateSchema>;
export type UserSelect = z.infer<typeof UserSelectSchema>;

export type Session = typeof session;
export type SessionSelect = z.infer<typeof SessionSelectSchema>;
export type SessionInsert = z.infer<typeof SessionInsertSchema>;
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;

export type Account = typeof account;
export type AccountSelect = z.infer<typeof AccountSelectSchema>;
export type AccountInsert = z.infer<typeof AccountInsertSchema>;
export type AccountUpdate = z.infer<typeof AccountUpdateSchema>;

export type Verification = typeof verification;
export type VerificationSelect = z.infer<typeof VerificationSelectSchema>;
export type VerificationInsert = z.infer<typeof VerificationInsertSchema>;
export type VerificationUpdate = z.infer<typeof VerificationUpdateSchema>;

export type Organization = typeof organization;
export type OrganizationSelect = z.infer<typeof OrganizationSelectSchema>;
export type OrganizationInsert = z.infer<typeof OrganizationInsertSchema>;
export type OrganizationUpdate = z.infer<typeof OrganizationUpdateSchema>;

export type Member = typeof member;
export type MemberSelect = z.infer<typeof MemberSelectSchema>;
export type MemberInsert = z.infer<typeof MemberInsertSchema>;
export type MemberUpdate = z.infer<typeof MemberUpdateSchema>;

export type Invitation = typeof invitation;
export type InvitationSelect = z.infer<typeof InvitationSelectSchema>;
export type InvitationInsert = z.infer<typeof InvitationInsertSchema>;
export type InvitationUpdate = z.infer<typeof InvitationUpdateSchema>;
