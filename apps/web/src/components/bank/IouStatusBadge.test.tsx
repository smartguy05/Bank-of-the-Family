import { describe, expect, it } from "vitest";
import type { IouStatus } from "@botf/shared";
import { IouStatusBadge } from "@/components/bank/IouStatusBadge";
import { renderToDom } from "@/test/render";

const cases: Array<[IouStatus, string]> = [
  ["pending_acceptance", "Needs OK"],
  ["open", "Open"],
  ["settled", "Settled"],
  ["declined", "Declined"],
  ["cancelled", "Cancelled"],
  ["forgiven", "Forgiven"],
];

describe("IouStatusBadge", () => {
  for (const [status, label] of cases) {
    it(`renders "${label}" for status "${status}"`, () => {
      const { container, unmount } = renderToDom(<IouStatusBadge status={status} />);
      expect(container.textContent).toBe(label);
      unmount();
    });
  }
});
