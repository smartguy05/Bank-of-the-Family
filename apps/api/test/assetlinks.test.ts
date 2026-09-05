import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";

describe("android assetlinks", () => {
  it("serves a well-formed assetlinks.json with fingerprints parsed from config", async () => {
    const ctx = await createTestContext({
      APP_ASSETLINKS_FINGERPRINTS: " AA:BB:CC , DD:EE:FF ,,",
      ANDROID_PACKAGE_NAME: "family.bank.testapp",
    });
    try {
      const res = await ctx.app.inject({ method: "GET", url: "/.well-known/assetlinks.json" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      const body = res.json() as Array<{
        relation: string[];
        target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
      expect(body[0]!.target.namespace).toBe("android_app");
      expect(body[0]!.target.package_name).toBe("family.bank.testapp");
      // Trimmed, and blank entries from the trailing ",," dropped.
      expect(body[0]!.target.sha256_cert_fingerprints).toEqual(["AA:BB:CC", "DD:EE:FF"]);
    } finally {
      await ctx.close();
    }
  });

  it("returns an empty fingerprint list when none are configured", async () => {
    const ctx = await createTestContext({ APP_ASSETLINKS_FINGERPRINTS: "" });
    try {
      const res = await ctx.app.inject({ method: "GET", url: "/.well-known/assetlinks.json" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ target: { sha256_cert_fingerprints: string[] } }>;
      expect(body[0]!.target.sha256_cert_fingerprints).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
