import { and, desc, eq } from "drizzle-orm";
import { anyProviderApiHasFinancialHistory } from "./api-registry";
import { db } from "./index";
import { project } from "./schema/project";
import { providerApi } from "./schema/provider-api";

type CreateProjectInput = {
  userId: string;
  name: string;
  description?: string;
};

/** Outcome of an owner-scoped delete, so callers can report the real reason. */
export type DeleteProjectResult =
  | { outcome: "deleted"; project: typeof project.$inferSelect }
  | { outcome: "not-found" }
  | { outcome: "has-history" };

type UpdateProjectInput = {
  id: string;
  userId: string;
  data: {
    name?: string;
    description?: string | null;
  };
};

export const createProject = async (input: CreateProjectInput) => {
  const [createdProject] = await db
    .insert(project)
    .values({
      userId: input.userId,
      name: input.name,
      description: input.description,
    })
    .returning();

  return createdProject;
};

export const listProjectsByUser = async (userId: string) => {
  return db
    .select()
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.updatedAt));
};

export const getProjectByIdForUser = async (id: string, userId: string) => {
  const [existingProject] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);

  return existingProject ?? null;
};

export const updateProjectByIdForUser = async (input: UpdateProjectInput) => {
  const [updatedProject] = await db
    .update(project)
    .set({
      ...input.data,
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, input.id), eq(project.userId, input.userId)))
    .returning();

  return updatedProject ?? null;
};

/**
 * Deletes a project the caller owns, cascading into its APIs and endpoints.
 *
 * Refused once any of those APIs has earned anything: the cascade would hit the
 * ledger's `ON DELETE RESTRICT` and surface as a raw foreign-key error, and the
 * revenue trail must survive regardless.
 */
export const deleteProjectByIdForUser = async (
  id: string,
  userId: string
): Promise<DeleteProjectResult> => {
  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);

  if (!existing) {
    return { outcome: "not-found" };
  }

  const apis = await db
    .select({ id: providerApi.id })
    .from(providerApi)
    .where(eq(providerApi.projectId, id));

  if (await anyProviderApiHasFinancialHistory(apis.map((api) => api.id))) {
    return { outcome: "has-history" };
  }

  const [deletedProject] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .returning();

  return deletedProject
    ? { outcome: "deleted", project: deletedProject }
    : { outcome: "not-found" };
};
