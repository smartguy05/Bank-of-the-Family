import type { FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "./errors";

/** Any signed-in user (parent or child), active. */
export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) throw unauthorized();
}

/** Signed-in parent (no family required). */
export async function requireParent(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) throw unauthorized();
  if (request.currentUser.role !== "parent") throw forbidden("Parents only");
}

/** Signed-in child. */
export async function requireChild(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) throw unauthorized();
  if (request.currentUser.role !== "child") throw forbidden("Children only");
}

/** Signed-in parent who has created or joined a family. */
export async function requireFamily(request: FastifyRequest): Promise<void> {
  await requireParent(request);
  if (!request.currentUser?.familyId) throw forbidden("Create or join a family first");
}
