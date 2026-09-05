import { describe, expect, it, vi } from "vitest";
import { useFamilyFormat } from "@/hooks/useFamilyFormat";
import { renderToDom } from "@/test/render";

vi.mock("@/hooks/useMe", () => ({
  useMe: () => ({
    data: { family: { currencyCode: "EUR", locale: "de-DE" } },
  }),
}));

function Probe() {
  const { fmt, parse } = useFamilyFormat();
  return (
    <div>
      <span data-testid="formatted">{fmt(123456)}</span>
      <span data-testid="parsed">{String(parse("1.234,56"))}</span>
      <span data-testid="invalid">{String(parse("not money"))}</span>
    </div>
  );
}

describe("useFamilyFormat", () => {
  it("formats using the family's currency and locale", () => {
    const { container, unmount } = renderToDom(<Probe />);
    const formatted = container.querySelector('[data-testid="formatted"]')?.textContent;
    // de-DE EUR formatting uses a comma decimal separator and trailing currency sign.
    expect(formatted).toContain("1.234,56");
    expect(formatted).toContain("€");
    unmount();
  });

  it("parses locale-formatted input back into minor units", () => {
    const { container, unmount } = renderToDom(<Probe />);
    expect(container.querySelector('[data-testid="parsed"]')?.textContent).toBe("123456");
    expect(container.querySelector('[data-testid="invalid"]')?.textContent).toBe("null");
    unmount();
  });
});
