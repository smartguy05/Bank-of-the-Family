import "fastify";
import type { Config } from "./config";
import type { Db } from "./db";
import type { Family, User } from "./db/schema";

/** Data stored in the server-side session. */
export interface SessionData {
  userId?: string;
  /** "parent" sessions come from OIDC, "child" from PIN login. */
  authMethod?: "oidc" | "pin";
  /** Transient OIDC state while the authorization code flow is in progress. */
  oidc?: { state: string; codeVerifier: string; nonce: string; returnTo?: string };
  /** Invite code carried through the OIDC round-trip so the callback can join the family. */
  inviteCode?: string;
  /** Authentik id_token, kept for RP-initiated logout. */
  idToken?: string;
}

declare module "fastify" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Session extends SessionData {}
  interface FastifyInstance {
    config: Config;
    db: Db;
  }
  interface FastifyRequest {
    /** The signed-in user for this request, loaded from `session.userId`. Null if not signed in. */
    currentUser: User | null;
    /** The current user's family, loaded when `currentUser.familyId` is set. */
    family: Family | null;
  }
}
