import { describe, expect, it } from "vitest";
import type { RequestStatus } from "@botf/shared";
import { RequestStatusBadge } from "@/components/bank/RequestStatusBadge";
import { renderToDom } from "@/test/render";

const cases: Array<[RequestStatus, string]> = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["declined", "Declined"],
  ["cancelled", "Cancelled"],
];

describe("RequestStatusBadge", () => {
  for (const [status, label] of cases) {
    it(`renders "${label}" for status "${status}"`, () => {
      const { container, unmount } = renderToDom(<RequestStatusBadge status={status} />);
      expect(container.textContent).toBe(label);
      unmount();
    });
  }
});
