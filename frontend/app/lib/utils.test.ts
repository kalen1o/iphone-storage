import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps the latest conflicting tailwind class", () => {
    expect(cn("p-2 text-sm", "p-4")).toBe("text-sm p-4");
  });

  it("skips falsy values while merging classes", () => {
    const hiddenClass: string | false = false;
    expect(cn("font-medium", hiddenClass, undefined, "text-blue-500")).toBe(
      "font-medium text-blue-500",
    );
  });
});
