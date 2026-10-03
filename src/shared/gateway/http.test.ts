import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/shared/contracts";
import { GatewayError, errorOutcome } from "./envelope";
import { handle } from "./http";

const getActor = vi.hoisted(() => vi.fn());
vi.mock("@/shared/auth/actor", () => ({ getActor }));

const actor: ActorContext = {
  actor_id: "00000000-0000-4000-8000-000000000001",
  organisation_id: "00000000-0000-4000-8000-000000000002",
  role: "employee",
  deal_ids: [],
  audience: "actor",
  scopes: [],
};
const URL_ = "http://localhost:3000/api/v1/chat";
const KEY = "6F1C2E3A-1B2C-4D5E-8F90-A1B2C3D4E5F6";
const ok = errorOutcome("CONFLICT"); // any marker outcome the run returns

const post = (headers: Record<string, string>, body = '{"message":"hi"}') =>
  new Request(URL_, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "idempotency-key": KEY,
      ...headers,
    },
    body,
  });
const chat = (request: Request, run = vi.fn(async () => ok)) =>
  handle(request, { body: "ChatRequest", idempotent: true }, run);
const code = async (res: Response) => [res.status, (await res.json()).error?.code];

describe("handle", () => {
  beforeEach(() => getActor.mockReset().mockResolvedValue(actor));

  it("rejects a foreign or missing Origin before identity", async () => {
    expect(await code(await chat(post({ origin: "https://evil.example" })))).toEqual([403, "ACCESS_DENIED"]);
    const noOrigin = post({});
    noOrigin.headers.delete("origin");
    expect(await code(await chat(noOrigin))).toEqual([403, "ACCESS_DENIED"]);
    expect(getActor).not.toHaveBeenCalled();
  });

  it("maps no session to 401 and an identity outage to 503, never ALLOW", async () => {
    getActor.mockResolvedValueOnce(null);
    expect(await code(await chat(post({})))).toEqual([401, "UNAUTHENTICATED"]);
    getActor.mockRejectedValueOnce(new Error("down"));
    const res = await chat(post({}));
    expect(res.status).toBe(503);
    expect((await res.json()).decision).toBeNull();
  });

  it("validates key, content type, size and strict body before running", async () => {
    const run = vi.fn(async () => ok);
    expect(await code(await chat(post({ "idempotency-key": "nope" }), run))).toEqual([400, "INVALID_INPUT"]);
    expect(await code(await chat(post({ "content-type": "text/plain" }), run))).toEqual([
      415,
      "UNSUPPORTED_FILE",
    ]);
    const big = JSON.stringify({ message: "x".repeat(17 * 1024) });
    expect(await code(await chat(post({}, big), run))).toEqual([413, "INVALID_INPUT"]);
    const chunked = new Request(post({}), {
      body: new Blob([big]).stream(),
      duplex: "half",
    } as RequestInit);
    expect(chunked.headers.get("content-length")).toBeNull();
    expect(await code(await chat(chunked, run))).toEqual([413, "INVALID_INPUT"]);
    expect(await code(await chat(post({}, "{"), run))).toEqual([400, "INVALID_INPUT"]);
    const extra = '{"message":"hi","role":"admin"}';
    expect(await code(await chat(post({}, extra), run))).toEqual([400, "INVALID_INPUT"]);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs with the parsed body and key, with no-store", async () => {
    const run = vi.fn(async () => ok);
    const res = await chat(post({}), run);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ actor, body: { message: "hi" }, key: KEY }));
    expect(res.status).toBe(409);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("maps GatewayError to its code and anything else to 503 without detail", async () => {
    const thrown = (e: unknown) =>
      chat(
        post({}),
        vi.fn(async () => Promise.reject(e)),
      );
    expect(await code(await thrown(new GatewayError("NOT_FOUND")))).toEqual([404, "NOT_FOUND"]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await thrown(new TypeError("secret row detail"));
    expect(await code(res.clone())).toEqual([503, "STATE_UNAVAILABLE"]);
    expect(await res.text()).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("gateway route failed", "TypeError");
    log.mockRestore();
  });

  it("skips Origin and body checks for GET", async () => {
    const run = vi.fn(async () => ok);
    await handle(new Request(URL_), {}, run);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ key: null, body: undefined }));
  });

  describe("multipart", () => {
    const FIELDS = ["file", "classification", "deal_id"];
    const upload = (body: BodyInit, headers: Record<string, string> = {}, run = vi.fn(async () => ok)) =>
      handle(
        new Request("http://localhost:3000/api/v1/imports/upload", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "idempotency-key": KEY, ...headers },
          body,
        }),
        { multipart: FIELDS, idempotent: true },
        run,
      );
    const form = (extra: [string, string][] = []) => {
      const f = new FormData();
      f.set("file", new File(["text,source_date\n"], "MIX-01.csv", { type: "text/csv" }));
      f.set("classification", "restricted");
      for (const [k, v] of extra) f.append(k, v);
      return f;
    };

    it("refuses a JSON body with 415 before reading it", async () => {
      const run = vi.fn(async () => ok);
      expect(await code(await upload('{"file":"x"}', { "content-type": "application/json" }, run))).toEqual([
        415,
        "UNSUPPORTED_FILE",
      ]);
      expect(run).not.toHaveBeenCalled();
    });

    it("counts bytes before parsing: 413 over the cap, also when chunked", async () => {
      const run = vi.fn(async () => ok);
      const big = new FormData();
      big.set("file", new File([new Uint8Array(2 * 1024 * 1024 + 65 * 1024)], "big.csv"));
      const encoded = new Response(big);
      const type = encoded.headers.get("content-type")!;
      const bytes = await encoded.arrayBuffer();
      expect(await code(await upload(bytes, { "content-type": type }, run))).toEqual([413, "INVALID_INPUT"]);
      const chunked = new Request("http://localhost:3000/api/v1/imports/upload", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "idempotency-key": KEY, "content-type": type },
        body: new Blob([bytes]).stream(),
        duplex: "half",
      } as RequestInit);
      expect(chunked.headers.get("content-length")).toBeNull();
      expect(await code(await handle(chunked, { multipart: FIELDS, idempotent: true }, run))).toEqual([
        413,
        "INVALID_INPUT",
      ]);
      expect(run).not.toHaveBeenCalled();
    });

    it("refuses an unknown or repeated field with 400", async () => {
      const run = vi.fn(async () => ok);
      expect(await code(await upload(form([["role", "admin"]]), {}, run))).toEqual([400, "INVALID_INPUT"]);
      expect(await code(await upload(form([["classification", "public"]]), {}, run))).toEqual([
        400,
        "INVALID_INPUT",
      ]);
      expect(run).not.toHaveBeenCalled();
    });

    it("passes one parsed form with its file to the run", async () => {
      const run = vi.fn(async () => ok);
      await upload(form(), {}, run);
      const { form: parsed } = (run.mock.calls[0] as unknown as [{ form: FormData }])[0];
      const file = parsed.get("file") as File;
      expect(file.name).toBe("MIX-01.csv");
      expect(await file.text()).toBe("text,source_date\n");
      expect(parsed.get("classification")).toBe("restricted");
    });
  });
});
