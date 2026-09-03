const endpoint = process.env.SYNC_WORKER_URL?.trim() || "http://app:3000/api/internal/sync";
const secret = process.env.SYNC_WORKER_SECRET?.trim();
if (!secret) throw new Error("SYNC_WORKER_SECRET is required");

console.log(`[sync-worker] polling ${new URL(endpoint).host}`);

const idleDelayMs = 60_000;
const workDelayMs = 5_000;

for (;;) {
  let delayMs = idleDelayMs;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!response.ok) throw new Error(`sync endpoint returned ${response.status}`);
    const result = await response.json();
    if (result && typeof result === "object" && "claimed" in result) {
      delayMs = Number(result.claimed) > 0 ? workDelayMs : idleDelayMs;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[sync-worker] ${message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
