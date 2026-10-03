import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DetectionPort, GatewayPolicy, GenerationPort, ThreatFeed } from "@/shared/contracts";
import { check } from "@/shared/contracts/validate";
import manifest from "@/shared/contracts/runtime-manifest.json";
import { SYSTEM_PROMPT } from "@/shared/gateway/chat";
import { matchSignatures, sha256Hex, verifyCoverage } from "@/shared/gateway/checks";
import { createDetectionPort, createGenerationPort } from "../index";
import { ProviderFailure } from "../providers/validation";
import type { Attempt, Category, Observation, Split } from "./core";
import { proposeThresholds } from "./core";
import { renderReport } from "./report";

type CorpusCase = {
  id: string;
  split: "development" | "held_out";
  category: Category;
  operation: string;
  audience: string;
  text: string;
  expected_risk: string;
};
type DemoCase = { id: string; text: string };
type Controls = {
  policy_version: number;
  feed_version: number;
  feed_expires_at: string;
  policy: GatewayPolicy;
  feed: ThreatFeed;
};
type Lock = {
  schema_version: 1;
  at: string;
  labels_reviewed_by: string;
  corpus_sha256: string;
  controls_sha256: string;
  source_sha256: string;
  demo_sha256: string;
  development_sha256: string;
  demo_results_sha256: string;
  policy_version: number;
  feed_version: number;
  laya_revision: string;
  ollama_digest: string;
  baseline_thresholds: GatewayPolicy["semantic"]["thresholds"];
  proposed_thresholds: GatewayPolicy["semantic"]["thresholds"] | null;
};

const root = path.resolve(__dirname, "../../../..");
const corpusPath = path.join(root, "docs/testing/semantic-cases.json");
const demoPath = path.join(__dirname, "demo-cases.json");
const sourcePaths = [
  path.join(__dirname, "core.ts"),
  path.join(__dirname, "run.ts"),
  path.join(__dirname, "report.ts"),
  path.join(root, "package-lock.json"),
  path.join(root, "src/features/detection/ports.ts"),
  path.join(root, "src/features/detection/providers/smoke.mjs"),
  path.join(root, "src/features/detection/providers/clients.ts"),
  path.join(root, "src/features/detection/providers/laya.ts"),
  path.join(root, "src/features/detection/providers/ollama.ts"),
  path.join(root, "src/features/detection/providers/transport.ts"),
  path.join(root, "src/features/detection/providers/validation.ts"),
  path.join(root, "src/shared/gateway/chat.ts"),
  path.join(root, "src/shared/gateway/checks.ts"),
  path.join(root, "src/shared/contracts/validate.ts"),
  path.join(root, "src/shared/contracts/runtime-manifest.json"),
];

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sourceDigest = () => digest(Buffer.concat(sourcePaths.map((file) => readFileSync(file))));
const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const safeCode = (error: unknown) =>
  error instanceof ProviderFailure
    ? error.code
    : error instanceof Error && /^[a-z_]+$/.test(error.message)
      ? error.message
      : "evaluation_error";

function controlsFrom(file: string): Controls {
  if (path.basename(file) === ".env.local" || path.basename(realpathSync(file)) === ".env.local")
    throw new Error("invalid_controls_path");
  const value = parse<Controls>(file);
  if (Object.keys(value).sort().join(",") !== "feed,feed_expires_at,feed_version,policy,policy_version")
    throw new Error("invalid_controls");
  const policy = check("GatewayPolicy", value.policy);
  const feed = check("ThreatFeed", value.feed);
  if (
    !policy.ok ||
    !feed.ok ||
    !Number.isInteger(value.policy_version) ||
    value.policy_version < 1 ||
    !Number.isInteger(value.feed_version) ||
    value.feed_version < 1 ||
    !(Date.parse(value.feed_expires_at) > Date.now())
  )
    throw new Error("invalid_controls");
  if (
    value.policy.semantic.checkpoint !== "typed-decisions" ||
    value.policy.execution.generation_model !== manifest.ollama_model ||
    value.policy.semantic.required !== true
  )
    throw new Error("controls_mismatch");
  return value;
}

function corpus(): CorpusCase[] {
  const value = parse<{ cases: CorpusCase[] }>(corpusPath);
  if (!Array.isArray(value.cases) || value.cases.length !== 24) throw new Error("invalid_corpus");
  const ids = new Set<string>();
  for (const item of value.cases) {
    if (
      ids.has(item.id) ||
      !/^[a-z0-9_-]+$/.test(item.id) ||
      !["development", "held_out"].includes(item.split) ||
      !["benign", "hard_benign", "attack"].includes(item.category) ||
      item.operation !== "chat" ||
      item.audience !== "public" ||
      typeof item.text !== "string" ||
      item.text.length === 0 ||
      item.expected_risk !== (item.category === "attack" ? "harmful" : "benign")
    )
      throw new Error("invalid_corpus");
    ids.add(item.id);
  }
  return value.cases;
}

function demos(): DemoCase[] {
  const value = parse<DemoCase[]>(demoPath);
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    new Set(value.map((item) => item.id)).size !== 3 ||
    value.some((item) => !/^[a-z0-9-]+$/.test(item.id) || typeof item.text !== "string" || !item.text)
  )
    throw new Error("invalid_demo_cases");
  return value;
}

function observation(result: Awaited<ReturnType<DetectionPort["assess"]>>): Observation {
  const semantic = result.semantic;
  if (
    !semantic.scores ||
    Object.values(semantic.scores).some((score) => typeof score !== "number" || !Number.isFinite(score)) ||
    typeof semantic.checkpoint_revision !== "string" ||
    typeof semantic.text_sha256 !== "string"
  )
    throw new Error("invalid_assessment");
  return {
    scores: semantic.scores as Observation["scores"],
    checkpoint_revision: semantic.checkpoint_revision,
    text_sha256: semantic.text_sha256,
    semantic_input_tokens: result.semantic_input_tokens,
    semantic_ms: result.semantic_ms,
    windows_completed: result.semantic.windows_completed,
  };
}

export async function runOne(
  item: { id: string; category: Category; split: Split; text: string },
  controls: Controls,
  detection: DetectionPort,
  generation: GenerationPort,
): Promise<Attempt> {
  const result: Attempt = {
    run_id: randomUUID(),
    case_id: item.id,
    split: item.split,
    category: item.category,
    input_findings: [],
    output_findings: [],
    input: null,
    output: null,
    generation: null,
    status: "incomplete",
    error_code: null,
  };
  const policy = controls.policy;
  const assess = async (text: string, operation: "chat_input" | "chat_output") => {
    const answer = await detection.assess(
      { call_id: randomUUID(), text, operation, audience: "actor" },
      policy,
      AbortSignal.timeout(policy.semantic.timeout_ms),
    );
    if (
      answer.semantic.checkpoint_revision !== manifest.laya_checkpoint_revision ||
      !verifyCoverage(text, answer.semantic, policy, manifest.laya_checkpoint_revision)
    )
      throw new Error("coverage_or_revision_mismatch");
    if (answer.semantic_input_tokens === null) throw new Error("usage_unknown");
    return answer;
  };
  try {
    result.input_findings = matchSignatures(item.text, controls.feed, "input_signature");
    result.input = observation(await assess(item.text, "chat_input"));
    const generated = await generation.generate(
      {
        call_id: randomUUID(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: item.text },
        ],
        tools: [],
        limits: policy.execution,
      },
      AbortSignal.timeout(policy.execution.provider_timeout_ms),
    );
    result.generation = {
      input_tokens: generated.input_tokens,
      output_tokens: generated.output_tokens,
      duration_ms: generated.duration_ms,
      model_digest: generated.model_digest,
      output_sha256: sha256Hex(generated.text),
      output_utf8_bytes: Buffer.byteLength(generated.text),
      tool_count: generated.tool_calls.length,
    };
    if (generated.model_digest !== manifest.ollama_model_digest) throw new Error("revision_mismatch");
    if (generated.input_tokens === null || generated.output_tokens === null || generated.duration_ms === null)
      throw new Error("usage_unknown");
    if (!generated.finished || !generated.text) throw new Error("generation_incomplete");
    if (generated.tool_calls.length !== 0) throw new Error("tool_call_refused");
    result.output_findings = matchSignatures(generated.text, controls.feed, "output_signature");
    result.output = observation(await assess(generated.text, "chat_output"));
    result.status = "complete";
    return result;
  } catch (error) {
    result.error_code = safeCode(error);
    return result;
  }
}

async function batch(
  file: string,
  cases: { id: string; category: Category; split: Split; text: string }[],
  repeats: number,
  controls: Controls,
  detection: DetectionPort,
  generation: GenerationPort,
) {
  for (const item of cases)
    for (let n = 0; n < repeats; n++) {
      const result = await runOne(item, controls, detection, generation);
      appendFileSync(file, json(result) + "\n", { flag: "a" });
      if (result.status !== "complete") throw new Error(result.error_code ?? "evaluation_incomplete");
    }
}

const attemptsFrom = (file: string): Attempt[] =>
  readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Attempt);

function options(args: string[]) {
  const [mode, ...rest] = args;
  if (!mode || !["prepare", "heldout"].includes(mode) || rest.length % 2 !== 0)
    throw new Error("invalid_arguments");
  const values = new Map<string, string>();
  for (let n = 0; n < rest.length; n += 2) {
    if (!rest[n].startsWith("--") || values.has(rest[n])) throw new Error("invalid_arguments");
    values.set(rest[n], rest[n + 1]);
  }
  const out = values.get("--out");
  const controls = values.get("--controls");
  if (!out || !controls) throw new Error("invalid_arguments");
  if (mode === "prepare" && !values.get("--labels-reviewed-by")) throw new Error("labels_unreviewed");
  if (
    mode === "prepare" &&
    !["Julian", "Bartosz", "Julian+Bartosz"].includes(values.get("--labels-reviewed-by") ?? "")
  )
    throw new Error("invalid_reviewer");
  const allowed = new Set(
    mode === "prepare" ? ["--out", "--controls", "--labels-reviewed-by"] : ["--out", "--controls"],
  );
  if ([...values.keys()].some((key) => !allowed.has(key))) throw new Error("invalid_arguments");
  return {
    mode,
    out: path.resolve(out),
    controls: path.resolve(controls),
    reviewer: values.get("--labels-reviewed-by") ?? "",
  };
}

export async function runSemanticEval(args: string[]) {
  try {
    const parsed = options(args);
    const controls = controlsFrom(parsed.controls);
    const detection = createDetectionPort();
    const generation = createGenerationPort();
    if (!detection || !generation) throw new Error("credential_unavailable");
    const all = corpus();
    const demo = demos();
    mkdirSync(parsed.out, { recursive: true });
    const devFile = path.join(parsed.out, "development.jsonl");
    const demoFile = path.join(parsed.out, "demo.jsonl");
    const heldFile = path.join(parsed.out, "heldout.jsonl");
    const lockFile = path.join(parsed.out, "lock.json");
    const source = sourceDigest();
    const controlsHash = digest(readFileSync(parsed.controls));
    const corpusHash = digest(readFileSync(corpusPath));
    const demoHash = digest(readFileSync(demoPath));
    if (parsed.mode === "prepare") {
      if ([devFile, demoFile, heldFile, lockFile].some(existsSync)) throw new Error("batch_already_started");
      await batch(
        devFile,
        all.filter((item) => item.split === "development").map((item) => ({ ...item, split: "development" })),
        10,
        controls,
        detection,
        generation,
      );
      await batch(
        demoFile,
        demo.map((item) => ({ ...item, split: "demo" as const, category: "benign" as const })),
        10,
        controls,
        detection,
        generation,
      );
      const proposal = proposeThresholds(attemptsFrom(devFile), controls.policy);
      const lock: Lock = {
        schema_version: 1,
        at: new Date().toISOString(),
        labels_reviewed_by: parsed.reviewer,
        corpus_sha256: corpusHash,
        controls_sha256: controlsHash,
        source_sha256: source,
        demo_sha256: demoHash,
        development_sha256: digest(readFileSync(devFile)),
        demo_results_sha256: digest(readFileSync(demoFile)),
        policy_version: controls.policy_version,
        feed_version: controls.feed_version,
        laya_revision: manifest.laya_checkpoint_revision,
        ollama_digest: manifest.ollama_model_digest,
        baseline_thresholds: controls.policy.semantic.thresholds,
        proposed_thresholds: proposal.thresholds,
      };
      writeFileSync(lockFile, json(lock) + "\n", { flag: "wx" });
      console.log(
        json({
          status: "prepared",
          development_attempts: 120,
          demo_attempts: 30,
          lock_sha256: digest(readFileSync(lockFile)),
        }),
      );
      return;
    }
    const lock = parse<Lock>(lockFile);
    if (
      lock.schema_version !== 1 ||
      lock.corpus_sha256 !== corpusHash ||
      lock.controls_sha256 !== controlsHash ||
      lock.source_sha256 !== source ||
      lock.demo_sha256 !== demoHash ||
      lock.development_sha256 !== digest(readFileSync(devFile)) ||
      lock.demo_results_sha256 !== digest(readFileSync(demoFile)) ||
      lock.policy_version !== controls.policy_version ||
      lock.feed_version !== controls.feed_version ||
      lock.laya_revision !== manifest.laya_checkpoint_revision ||
      lock.ollama_digest !== manifest.ollama_model_digest
    )
      throw new Error("freeze_mismatch");
    const frozenProposal = proposeThresholds(attemptsFrom(devFile), controls.policy);
    if (
      json(lock.baseline_thresholds) !== json(controls.policy.semantic.thresholds) ||
      json(lock.proposed_thresholds) !== json(frozenProposal.thresholds)
    )
      throw new Error("freeze_mismatch");
    writeFileSync(
      path.join(parsed.out, "heldout.started"),
      json({ at: new Date().toISOString(), lock_sha256: digest(readFileSync(lockFile)) }) + "\n",
      { flag: "wx" },
    );
    await batch(
      heldFile,
      all.filter((item) => item.split === "held_out").map((item) => ({ ...item, split: "held_out" })),
      1,
      controls,
      detection,
      generation,
    );
    const report = renderReport({
      development: attemptsFrom(devFile),
      demo: attemptsFrom(demoFile),
      heldout: attemptsFrom(heldFile),
      controls,
      lock,
    });
    writeFileSync(path.join(parsed.out, "report.md"), report, { flag: "wx" });
    console.log(json({ status: "heldout_complete", heldout_attempts: 12, report_sha256: digest(report) }));
  } catch (error) {
    console.error(json({ status: "incomplete", error_code: safeCode(error) }));
    process.exitCode = 1;
  }
}
