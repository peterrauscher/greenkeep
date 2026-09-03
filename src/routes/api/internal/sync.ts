import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { runDuePremiumSyncs } from "@/lib/premium-sync-runner.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

export const Route = createFileRoute("/api/internal/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SYNC_WORKER_SECRET?.trim();
        if (!secret) return json({ error: "Worker is not configured" }, 503);

        const supplied = request.headers.get("Authorization") ?? "";
        const expected = `Bearer ${secret}`;
        const suppliedBytes = Buffer.from(supplied);
        const expectedBytes = Buffer.from(expected);
        const authorized =
          suppliedBytes.length === expectedBytes.length &&
          timingSafeEqual(suppliedBytes, expectedBytes);
        if (!authorized) return json({ error: "Unauthorized" }, 401);

        return json(await runDuePremiumSyncs(1));
      },
    },
  },
});
