// Read-only diagnostics for the local demo services. Never prints keys or provider bodies.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const manifest = JSON.parse(
  readFileSync(new URL("../src/shared/contracts/runtime-manifest.json", import.meta.url), "utf8"),
);

export function projectConfig(path, inherited = process.env) {
  const file = parseEnv(readFileSync(path, "utf8"));
  return {
    key: file.LAYA_API_KEY ?? inherited.LAYA_API_KEY,
    shellKeyDiffers: Boolean(
      file.LAYA_API_KEY && inherited.LAYA_API_KEY && file.LAYA_API_KEY !== inherited.LAYA_API_KEY,
    ),
  };
}

async function getJson(url, headers, fetcher) {
  try {
    const response = await fetcher(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { error: response.status === 401 || response.status === 403 ? "auth" : "http" };
    const body = await response.text();
    if (Buffer.byteLength(body) > 65536) return { error: "invalid_response" };
    const value = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "invalid_response" };
    return { value };
  } catch (error) {
    return {
      error:
        error?.cause?.code === "ECONNREFUSED"
          ? "not_running"
          : error?.name === "TimeoutError"
            ? "timeout"
            : "unavailable",
    };
  }
}

export async function inspectLocalModels(config, fetcher = fetch) {
  const results = [];
  if (config.shellKeyDiffers)
    results.push({
      service: "environment",
      ok: false,
      code: "shell_key_override",
      message:
        "The shell LAYA_API_KEY differs from .env.local. Run unset LAYA_API_KEY before starting the app or smoke test. This diagnostic uses the project file.",
    });
  if (!config.key?.trim()) {
    results.push({
      service: "laya",
      ok: false,
      code: "missing_key",
      message: "Set LAYA_API_KEY in .env.local and use the same key when starting Laya.",
    });
  } else {
    const result = await getJson(
      "http://127.0.0.1:8000/health",
      { authorization: `Bearer ${config.key}` },
      fetcher,
    );
    const health = result.value;
    const authenticated = Array.isArray(health?.loaded) && health.loaded.includes(manifest.laya_models);
    const revisionMatches = health?.revisions?.[manifest.laya_models] === manifest.laya_checkpoint_revision;
    const code =
      result.error ??
      (!authenticated ? "authenticated_health_missing" : !revisionMatches ? "revision_mismatch" : "ready");
    const messages = {
      ready: "Authenticated Laya is loaded at the pinned revision.",
      not_running:
        "Nothing is listening on 127.0.0.1:8000. Start Laya using docs/team/setup.md; Ollama on port 11434 is a separate service.",
      auth: "Laya rejected the project key. Start Laya and the app with the same LAYA_API_KEY.",
      authenticated_health_missing:
        "Laya returned no authenticated model details. A public status=ok is not readiness; check that Laya and .env.local use the same key.",
      revision_mismatch:
        "Laya is running with a different checkpoint revision. Use the runtime manifest pin.",
    };
    results.push({
      service: "laya",
      ok: code === "ready",
      code,
      message:
        messages[code] ??
        "Laya could not be verified. Check its local process log; no response body is printed.",
    });
  }
  const result = await getJson("http://127.0.0.1:11434/api/tags", {}, fetcher);
  const models = result.value?.models;
  const matches = Array.isArray(models) ? models.filter((m) => m?.name === manifest.ollama_model) : [];
  const code =
    result.error ??
    (matches.length !== 1
      ? "model_missing"
      : matches[0].digest !== manifest.ollama_model_digest
        ? "revision_mismatch"
        : "ready");
  const messages = {
    ready: "Ollama already serves the pinned Qwen model. Do not start a second ollama serve process.",
    not_running:
      "Nothing is listening on 127.0.0.1:11434. Start the Ollama app or run ollama serve in a terminal that stays open.",
    model_missing:
      "Ollama is running but qwen3:8b is missing. Follow docs/team/setup.md to prepare the pinned model.",
    revision_mismatch: "Ollama's qwen3:8b digest differs from the runtime manifest.",
  };
  results.push({
    service: "ollama",
    ok: code === "ready",
    code,
    message: messages[code] ?? "Ollama could not be verified. Check its local process log.",
  });
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const results = await inspectLocalModels(projectConfig(process.argv[2] ?? ".env.local"));
    for (const row of results)
      console.log(`${row.ok ? "OK" : "FAIL"} ${row.service} (${row.code}): ${row.message}`);
    console.log(
      "Readiness is not a security-accuracy test. Run the synthetic provider smoke and semantic evaluation separately.",
    );
    process.exitCode = results.every((row) => row.ok) ? 0 : 1;
  } catch {
    console.error(
      "Cannot read the project environment file. Run from the project directory or pass its .env.local path.",
    );
    process.exitCode = 1;
  }
}
