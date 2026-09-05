import * as client from "openid-client";
import type { Config } from "../config";

let cached: {
  issuer: string;
  clientId: string;
  configPromise: Promise<client.Configuration>;
} | null = null;

/** Discovers (and caches) the Authentik OIDC configuration. Throws if OIDC is not configured. */
export function getOidcConfig(config: Config): Promise<client.Configuration> {
  if (
    !config.oidcEnabled ||
    !config.AUTHENTIK_ISSUER ||
    !config.AUTHENTIK_CLIENT_ID ||
    !config.AUTHENTIK_CLIENT_SECRET
  ) {
    throw new Error("OIDC is not configured");
  }
  if (
    cached &&
    cached.issuer === config.AUTHENTIK_ISSUER &&
    cached.clientId === config.AUTHENTIK_CLIENT_ID
  ) {
    return cached.configPromise;
  }
  const configPromise = client.discovery(
    new URL(config.AUTHENTIK_ISSUER),
    config.AUTHENTIK_CLIENT_ID,
    config.AUTHENTIK_CLIENT_SECRET,
    undefined,
    config.isProd ? undefined : { execute: [client.allowInsecureRequests] },
  );
  cached = { issuer: config.AUTHENTIK_ISSUER, clientId: config.AUTHENTIK_CLIENT_ID, configPromise };
  return configPromise;
}

/** Test-only: clears the cached discovery so a freshly started mock issuer is re-discovered. */
export function resetOidcConfigCache(): void {
  cached = null;
}

/** The API's own callback endpoint, which the web app's origin proxies through to. */
export function oidcRedirectUri(config: Config): string {
  return `${config.APP_URL}/api/auth/oidc/callback`;
}
