# Authenticated model bridge handoff

The relay forwards four fixed JSON routes from an HTTPS tunnel to loopback Laya and Ollama. It binds only `127.0.0.1:8787`, requires the 64-character hex `MODEL_BRIDGE_TOKEN` on every route, replaces that bearer with `LAYA_API_KEY` for Laya, and sends no bearer to Ollama. It holds no Supabase credential.

## Configuration and start

- Vercel server environment: `MODEL_BRIDGE_URL` (the tunnel's HTTPS origin, without path or query) and `MODEL_BRIDGE_TOKEN`. `LAYA_API_KEY` is not required on Vercel.
- Mac relay private environment file: `LAYA_API_KEY` and the same `MODEL_BRIDGE_TOKEN`; file mode `0600`, outside the repository. Bartosz enters the token into Vercel in person. Never paste either secret into chat, logs, a PR, or a committed file.
- From the repository root, start the relay with `node --env-file=<private file> src/features/detection/bridge/bridge.mjs`.
- Expose only the relay with `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8787`, or use an existing named HTTPS tunnel to that same local address. Do not expose ports 8000 or 11434.

The available tunnel for the live smoke was a Cloudflare Quick Tunnel. Its hostname is **not stable** and changes on restart; Bartosz must update `MODEL_BRIDGE_URL` in Vercel and redeploy after a URL change. The current URL belongs in the PR handoff, not in committed configuration. A stable named tunnel is preferable for judging if Bartosz can supply one.

## Verification and limits

- `npm run check` passed, including the build and all 679 tests.
- A local relay smoke returned HTTP 200 for one real Laya assessment and one real Qwen generation.
- The same two authenticated requests returned HTTP 200 through the temporary HTTPS tunnel. Only status codes were printed; no generated text, request body, or credential was logged.
- The relay caps requests at 256 KiB, responses at 32 KiB for metadata and 64 KiB for inference, and active calls at two. Unknown routes return 404; wrong tokens return 401. Redirects and retries are disabled.
- There is deliberately no relay call ledger. Unknown outcomes remain unresolved in the gateway's durable Postgres records; a lost response is not evidence of zero usage or safe replay.
