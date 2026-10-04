import { describe, expect, it } from "vitest";
import { namedSourceIn } from "./source-resolution";

describe("named source recognition", () => {
  it("recognises a filename without consuming the surrounding question", () => {
    expect(namedSourceIn("Please summarise MIX-01.csv and cite it.")).toBe("MIX-01.csv");
  });
  it("recognises a quoted filename with spaces and a stable dataset alias", () => {
    expect(namedSourceIn('Use file "Aster Finance.pdf" for this answer.')).toBe("Aster Finance.pdf");
    expect(namedSourceIn("What does RES-01 say? ")).toBe("RES-01");
  });
  it("does not treat an ordinary topic as a file selector", () => {
    expect(namedSourceIn("What is the AsterCloud revenue forecast? ")).toBeNull();
  });
});
