import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { project } from "./schema/project";

type CreateProjectInput = {
  userId: string;
  name: string;
  description?: string;
};

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

export const deleteProjectByIdForUser = async (id: string, userId: string) => {
  const [deletedProject] = await db
    .delete(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .returning();

  return deletedProject ?? null;
};
