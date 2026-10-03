import { expect, it } from "vitest";
import { parseSecurityVerdict } from "./chat-verification";

it("rejects duplicate JSON verdict fields instead of allowing a later false value", () => {
  expect(
    parseSecurityVerdict(
      '{"instruction_manipulation":true,"instruction_manipulation":false,"sensitive_exposure":false,"resource_abuse":false,"uncertain":false}',
    ),
  ).toBeNull();
});
