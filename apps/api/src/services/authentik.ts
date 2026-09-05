import type { Config } from "../config";
import { AppError, conflict } from "../lib/errors";

/** Injectable so tests can stub Authentik's API without a real server. */
export type FetchImpl = typeof fetch;

function authHeaders(config: Config): Record<string, string> {
  return {
    Authorization: `Bearer ${config.AUTHENTIK_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function looksLikeUsernameError(body: unknown): boolean {
  try {
    return JSON.stringify(body).toLowerCase().includes("username");
  } catch {
    return false;
  }
}

/** GET /core/groups/?name=<name> and returns the first match's pk. */
export async function findGroupIdByName(
  config: Config,
  name: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const url = new URL(`${config.AUTHENTIK_API_URL}/core/groups/`);
  url.searchParams.set("name", name);
  const res = await fetchImpl(url.toString(), { headers: authHeaders(config) });
  if (!res.ok) {
    throw new AppError(502, "AUTHENTIK_ERROR", `Authentik group lookup failed (${res.status})`);
  }
  const data = (await res.json()) as { results?: Array<{ pk: string }> };
  const group = data.results?.[0];
  if (!group) {
    throw new AppError(502, "AUTHENTIK_ERROR", `Authentik group not found: ${name}`);
  }
  return group.pk;
}

async function addUserToGroup(
  config: Config,
  groupId: string,
  pk: string,
  fetchImpl: FetchImpl,
): Promise<void> {
  const res = await fetchImpl(`${config.AUTHENTIK_API_URL}/core/groups/${groupId}/add_user/`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({ pk }),
  });
  if (!res.ok) {
    throw new AppError(502, "AUTHENTIK_ERROR", "Failed to add the new user to the parent group");
  }
}

/**
 * Creates an Authentik user. Tries to set the parent group at creation time; if that request is
 * rejected, retries without `groups` and falls back to a separate add_user call.
 */
export async function createAuthentikUser(
  config: Config,
  input: { username: string; name: string; email?: string; groupId: string },
  fetchImpl: FetchImpl = fetch,
): Promise<{ pk: string }> {
  const base = config.AUTHENTIK_API_URL;
  const withGroups = {
    username: input.username,
    name: input.name,
    email: input.email,
    is_active: true,
    groups: [input.groupId],
  };
  let res = await fetchImpl(`${base}/core/users/`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify(withGroups),
  });

  if (res.status === 400) {
    const firstBody = await safeJson(res);
    if (looksLikeUsernameError(firstBody)) {
      throw conflict("USERNAME_TAKEN", "That username is already taken");
    }
    // Retry without `groups`, then add the group membership explicitly.
    const { groups: _groups, ...withoutGroups } = withGroups;
    res = await fetchImpl(`${base}/core/users/`, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify(withoutGroups),
    });
    if (res.status === 400) {
      const secondBody = await safeJson(res);
      if (looksLikeUsernameError(secondBody)) {
        throw conflict("USERNAME_TAKEN", "That username is already taken");
      }
      throw new AppError(502, "AUTHENTIK_ERROR", "Authentik rejected the new user");
    }
    if (!res.ok) {
      throw new AppError(502, "AUTHENTIK_ERROR", `Authentik user create failed (${res.status})`);
    }
    const user = (await res.json()) as { pk: string };
    await addUserToGroup(config, input.groupId, user.pk, fetchImpl);
    return user;
  }

  if (!res.ok) {
    throw new AppError(502, "AUTHENTIK_ERROR", `Authentik user create failed (${res.status})`);
  }
  return (await res.json()) as { pk: string };
}

export async function setAuthentikPassword(
  config: Config,
  pk: string,
  password: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const res = await fetchImpl(`${config.AUTHENTIK_API_URL}/core/users/${pk}/set_password/`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    throw new AppError(502, "AUTHENTIK_ERROR", "Failed to set the new user's password");
  }
}
