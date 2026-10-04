import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

try {
  const [source, target] = process.argv.slice(2);
  if (!path.isAbsolute(source) || !path.isAbsolute(target))
    throw new Error("Use absolute input and output paths");
  const previous = JSON.parse(await readFile(source, "utf8"));
  if (previous.schema_version !== 1 || previous.version !== 3 || previous.client_guard)
    throw new Error("Expected an unchanged policy v3 without client_guard");
  const next = {
    ...previous,
    version: 4,
    client_guard: {
      profile: "restricted-demo-v1",
      prompt_assessment_required: true,
      allowed_tools: [
        "Read",
        "Edit",
        "Write",
        "mcp__interlock__search_excerpts",
        "mcp__interlock__read_excerpt",
      ],
      editable_root: "src",
      editable_extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css"],
      max_prompt_bytes: 6000,
      max_edit_bytes: 2000,
    },
  };
  const schema = JSON.parse(
    await readFile(new URL("../docs/contracts/policy.schema.json", import.meta.url), "utf8"),
  );
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  if (!ajv.validate(schema, next)) throw new Error("Policy v4 failed schema validation");
  for (const field of ["semantic", "budgets", "retention", "execution", "imports", "comparison_rate"])
    if (JSON.stringify(next[field]) !== JSON.stringify(previous[field]))
      throw new Error(`Existing ${field} was changed`);
  await writeFile(target, JSON.stringify(next, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write("Policy v4 candidate written for command-center diff. No policy was activated.\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
