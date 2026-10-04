import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRows, indexResults } from "../control-matrix.mjs";

test("control matrix passes a row only when every mapped test ran and passed", () => {
  const report = {
    testResults: [
      {
        name: "/repo/src/a.test.ts",
        assertionResults: [
          { fullName: "a allows", status: "passed" },
          { fullName: "a blocks", status: "passed" },
          { fullName: "a skipped", status: "skipped" },
        ],
      },
    ],
  };
  const index = indexResults(report, "/repo");
  const row = (block) => ({ id: "X", allow: [{ file: "src/a.test.ts", test: "a allows" }], block });
  const [passed, missing, skipped] = evaluateRows(
    [
      row([{ file: "src/a.test.ts", test: "a blocks" }]),
      row([{ file: "src/a.test.ts", test: "a renamed" }]),
      row([{ file: "src/a.test.ts", test: "a skipped" }]),
    ],
    index,
  );
  assert.equal(passed.pass, true);
  assert.equal(missing.pass, false);
  assert.equal(missing.block[0].status, "missing");
  assert.equal(skipped.pass, false);
  assert.equal(skipped.block[0].status, "skipped");
});
