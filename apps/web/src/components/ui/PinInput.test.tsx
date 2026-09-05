import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PinInput } from "@/components/ui/PinInput";
import { fireKeyDown, renderToDom, setInputValue } from "@/test/render";

function Harness({
  length = 4,
  onComplete,
}: {
  length?: 4 | 5 | 6;
  onComplete?: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  return <PinInput length={length} value={value} onChange={setValue} onComplete={onComplete} />;
}

describe("PinInput", () => {
  it("renders one masked digit box per length", () => {
    const { container, unmount } = renderToDom(<Harness length={6} />);
    const inputs = container.querySelectorAll("input");
    expect(inputs).toHaveLength(6);
    inputs.forEach((input) => expect(input.type).toBe("password"));
    unmount();
  });

  it("advances focus to the next box as digits are typed and fires onComplete", () => {
    const completed: string[] = [];
    const { container, unmount } = renderToDom(
      <Harness length={4} onComplete={(v) => completed.push(v)} />,
    );
    const inputs = Array.from(container.querySelectorAll("input"));

    setInputValue(inputs[0]!, "1");
    setInputValue(inputs[1]!, "2");
    setInputValue(inputs[2]!, "3");
    expect(completed).toHaveLength(0);
    setInputValue(inputs[3]!, "4");

    expect(completed).toEqual(["1234"]);
    expect(inputs.map((i) => i.value)).toEqual(["1", "2", "3", "4"]);
    unmount();
  });

  it("backspace on an empty box moves focus back and clears the previous digit", () => {
    const { container, unmount } = renderToDom(<Harness length={4} />);
    const inputs = Array.from(container.querySelectorAll("input"));
    setInputValue(inputs[0]!, "5");
    expect(inputs[0]!.value).toBe("5");

    // Move to box 2 (empty) and backspace: should clear box 1.
    inputs[1]!.focus();
    fireKeyDown(inputs[1]!, "Backspace");
    expect(inputs[0]!.value).toBe("");
    unmount();
  });

  it("ignores non-numeric input", () => {
    const { container, unmount } = renderToDom(<Harness length={4} />);
    const input = container.querySelector("input")!;
    setInputValue(input, "a");
    expect(input.value).toBe("");
    unmount();
  });
});
