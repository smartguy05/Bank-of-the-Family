import {
  createFamilyBody,
  createInviteBody,
  familyInviteSchema,
  familySchema,
  invitePreviewSchema,
  meSchema,
  okResponse,
  registerViaInviteBody,
  registerViaInviteResponse,
  updateFamilyBody,
  userSchema,
} from "@botf/shared";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { families, users } from "../db/schema";
import { AppError, forbidden } from "../lib/errors";
import { requireFamily, requireParent, requireUser } from "../lib/guards";
import { audit } from "../services/audit";
import {
  acceptInviteForUser,
  assertValidCurrency,
  assertValidTimezone,
  createFamily,
  createInvite,
  deleteInvite,
  getInvitePreview,
  listInvites,
  listParents,
  registerViaInvite,
  toFamilyDto,
  updateFamily,
} from "../services/families";
import { toUserDto } from "../services/users";

export const familiesRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/families",
    {
      preHandler: [requireParent],
      schema: { tags: ["families"], body: createFamilyBody, response: { 200: familySchema } },
    },
    async (request) => {
      const family = await createFamily(app.db, request.currentUser!.id, request.body);
      await audit(app.db, {
        familyId: family.id,
        actorUserId: request.currentUser!.id,
        action: "family.create",
        entity: "family",
        entityId: family.id,
        data: { name: family.name },
      });
      return family;
    },
  );

  r.get(
    "/families/current",
    {
      preHandler: [requireFamily],
      schema: { tags: ["families"], response: { 200: familySchema } },
    },
    async (request) => toFamilyDto(request.family!),
  );

  r.patch(
    "/families/current",
    {
      preHandler: [requireFamily],
      schema: { tags: ["families"], body: updateFamilyBody, response: { 200: familySchema } },
    },
    async (request) => {
      if (request.body.currencyCode) assertValidCurrency(request.body.currencyCode);
      if (request.body.timezone) assertValidTimezone(request.body.timezone);
      const family = await updateFamily(app.db, request.family!.id, request.body);
      await audit(app.db, {
        familyId: family.id,
        actorUserId: request.currentUser!.id,
        action: "family.update",
        entity: "family",
        entityId: family.id,
        data: request.body,
      });
      return family;
    },
  );

  r.get(
    "/families/current/parents",
    {
      preHandler: [requireFamily],
      schema: { tags: ["families"], response: { 200: z.array(userSchema) } },
    },
    async (request) => listParents(app.db, request.family!.id),
  );

  r.get(
    "/families/current/invites",
    {
      preHandler: [requireFamily],
      schema: { tags: ["families"], response: { 200: z.array(familyInviteSchema) } },
    },
    async (request) => listInvites(app.db, request.family!.id),
  );

  r.post(
    "/families/current/invites",
    {
      preHandler: [requireFamily],
      schema: { tags: ["families"], body: createInviteBody, response: { 200: familyInviteSchema } },
    },
    async (request) => {
      const invite = await createInvite(app.db, {
        familyId: request.family!.id,
        createdBy: request.currentUser!.id,
        body: request.body,
      });
      await audit(app.db, {
        familyId: request.family!.id,
        actorUserId: request.currentUser!.id,
        action: "invite.create",
        entity: "family_invite",
        entityId: invite.id,
        data: {},
      });
      return invite;
    },
  );

  r.delete(
    "/families/current/invites/:id",
    {
      preHandler: [requireFamily],
      schema: {
        tags: ["families"],
        params: z.object({ id: z.string() }),
        response: { 200: okResponse },
      },
    },
    async (request) => {
      await deleteInvite(app.db, request.family!.id, request.params.id);
      return { ok: true as const };
    },
  );

  r.get(
    "/invites/:code",
    {
      schema: {
        tags: ["families"],
        params: z.object({ code: z.string() }),
        response: { 200: invitePreviewSchema },
      },
    },
    async (request) => getInvitePreview(app.db, request.params.code),
  );

  r.post(
    "/invites/:code/accept",
    {
      preHandler: [requireUser],
      schema: {
        tags: ["families"],
        params: z.object({ code: z.string() }),
        response: { 200: meSchema },
      },
    },
    async (request) => {
      if (request.currentUser!.role !== "parent") throw forbidden("Parents only");
      const familyId = await acceptInviteForUser(app.db, {
        code: request.params.code,
        userId: request.currentUser!.id,
      });
      await audit(app.db, {
        familyId,
        actorUserId: request.currentUser!.id,
        action: "invite.accept",
        entity: "family_invite",
        entityId: request.params.code,
        data: {},
      });
      delete request.session.inviteCode;

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, request.currentUser!.id))
        .limit(1);
      const [family] = await app.db
        .select()
        .from(families)
        .where(eq(families.id, familyId))
        .limit(1);
      return {
        user: toUserDto(user!),
        family: family ? toFamilyDto(family) : null,
        pendingInviteCode: null,
      };
    },
  );

  r.post(
    "/invites/:code/register",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["families"],
        params: z.object({ code: z.string() }),
        body: registerViaInviteBody,
        response: { 200: registerViaInviteResponse },
      },
    },
    async (request) => {
      if (!app.config.authentikApiEnabled) {
        throw new AppError(503, "AUTHENTIK_API_NOT_CONFIGURED", "Authentik API is not configured");
      }
      return registerViaInvite(app.db, app.config, {
        code: request.params.code,
        body: request.body,
      });
    },
  );
};
