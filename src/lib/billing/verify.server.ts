import { hasAnyRevenueCatEntitlement } from "../../../scripts/revenuecat-access.mjs";
import {
  BILLING_UNAVAILABLE_MESSAGE,
  PAYMENT_REQUIRED_MESSAGE,
  PREMIUM_REQUIRED_MESSAGE,
  REVENUECAT_PREMIUM_ENTITLEMENT_ID,
  REVENUECAT_WRITE_ENTITLEMENT_ID,
} from "./constants";

const CHECK_TIMEOUT_MS = 5_000;
const POSITIVE_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1_024;
const grantedUntilByAccess = new Map<string, number>();

class PaymentRequiredError extends Error {
  readonly status = 402;

  constructor() {
    super(PAYMENT_REQUIRED_MESSAGE);
    this.name = "PaymentRequiredError";
  }
}

export class PremiumRequiredError extends Error {
  readonly status = 402;

  constructor() {
    super(PREMIUM_REQUIRED_MESSAGE);
    this.name = "PremiumRequiredError";
  }
}

class BillingUnavailableError extends Error {
  readonly status = 503;

  constructor(message = BILLING_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "BillingUnavailableError";
  }
}

function rememberGranted(accessKey: string, now: number): void {
  if (grantedUntilByAccess.size >= MAX_CACHE_ENTRIES) {
    for (const [cachedAccessKey, grantedUntil] of grantedUntilByAccess) {
      if (grantedUntil <= now) grantedUntilByAccess.delete(cachedAccessKey);
    }
  }
  if (grantedUntilByAccess.size >= MAX_CACHE_ENTRIES) {
    const oldestAccessKey = grantedUntilByAccess.keys().next().value;
    if (oldestAccessKey) grantedUntilByAccess.delete(oldestAccessKey);
  }
  grantedUntilByAccess.set(accessKey, now + POSITIVE_CACHE_TTL_MS);
}

async function hasRequiredEntitlement(userId: string, entitlementIds: string[]): Promise<boolean> {
  const now = Date.now();
  const accessKey = `${userId}:${entitlementIds.join(",")}`;
  if ((grantedUntilByAccess.get(accessKey) ?? 0) > now) return true;
  grantedUntilByAccess.delete(accessKey);

  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) {
    throw new BillingUnavailableError("Payments are not configured yet.");
  }

  let granted: boolean;
  try {
    granted = await hasAnyRevenueCatEntitlement({
      appUserId: userId,
      apiKey,
      entitlementIds,
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      nowMs: now,
    });
  } catch (error) {
    console.error("[billing] RevenueCat entitlement lookup failed", error);
    throw new BillingUnavailableError();
  }

  if (granted) rememberGranted(accessKey, now);
  return granted;
}

/** Manual writes are included in either the one-time or monthly product. */
export async function requireWriteEntitlement(userId: string): Promise<void> {
  const granted = await hasRequiredEntitlement(userId, [
    REVENUECAT_WRITE_ENTITLEMENT_ID,
    REVENUECAT_PREMIUM_ENTITLEMENT_ID,
  ]);
  if (!granted) throw new PaymentRequiredError();
}

/** Automatic sync requires the recurring premium entitlement. */
export async function requirePremiumEntitlement(userId: string): Promise<void> {
  const granted = await hasRequiredEntitlement(userId, [REVENUECAT_PREMIUM_ENTITLEMENT_ID]);
  if (!granted) throw new PremiumRequiredError();
}
