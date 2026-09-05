import { afterEach, describe, expect, it, vi } from "vitest";
import { getPushState, urlBase64ToUint8Array } from "@/lib/push";

describe("urlBase64ToUint8Array", () => {
  it("decodes a plain base64 string", () => {
    // "hello" -> base64 "aGVsbG8="
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it("decodes URL-safe characters (- and _) and restores padding", () => {
    // bytes [0xfb, 0xff, 0xfe] -> base64 "+//+" -> url-safe "-__-"
    const bytes = urlBase64ToUint8Array("-__-");
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xfe]);
  });
});

describe("getPushState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      Reflect.deleteProperty(navigator, "serviceWorker");
    } catch {
      // ignore
    }
  });

  it("returns 'unsupported' when the browser lacks the Push API (jsdom has none of it)", async () => {
    expect(await getPushState()).toBe("unsupported");
  });

  it("returns 'denied' when notification permission was denied", async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    vi.stubGlobal("PushManager", class {});
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    expect(await getPushState()).toBe("denied");
  });

  it("returns 'subscribed' when a push subscription already exists", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubGlobal("PushManager", class {});
    const registration = {
      pushManager: { getSubscription: () => Promise.resolve({ endpoint: "https://example.com" }) },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(registration) },
      configurable: true,
    });
    expect(await getPushState()).toBe("subscribed");
  });

  it("returns 'prompt' when supported but not yet subscribed", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    vi.stubGlobal("PushManager", class {});
    const registration = { pushManager: { getSubscription: () => Promise.resolve(null) } };
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(registration) },
      configurable: true,
    });
    expect(await getPushState()).toBe("prompt");
  });
});
