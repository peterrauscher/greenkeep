import { useCallback, useEffect, useState } from "react";
import { Purchases } from "@revenuecat/purchases-js";
import type { CustomerInfo, Package as RevenueCatPackage } from "@revenuecat/purchases-js";
import { REVENUECAT_PREMIUM_ENTITLEMENT_ID, REVENUECAT_WRITE_ENTITLEMENT_ID } from "./constants";

export type RevenueCatAccessStatus = "loading" | "ready" | "unavailable" | "error";
export type RevenueCatPlan = "lifetime" | "premium";
export type PurchaseOutcome = "unlocked" | "cancelled" | "failed";

export type RevenueCatProduct = {
  title: string;
  description: string | null;
  price: string;
  cadence: string;
};

export type RevenueCatGrants = {
  hasWriteAccess: boolean;
  hasPremiumAccess: boolean;
};

export type RevenueCatAccess = RevenueCatGrants & {
  status: RevenueCatAccessStatus;
  lifetimeProduct: RevenueCatProduct | null;
  premiumProduct: RevenueCatProduct | null;
  managementUrl: string | null;
  error: string | null;
  isBusy: boolean;
  purchase: (plan: RevenueCatPlan) => Promise<PurchaseOutcome>;
  refresh: () => Promise<RevenueCatGrants>;
};

type ProductSnapshot = RevenueCatProduct & { rcPackage: RevenueCatPackage };
type Snapshot = RevenueCatGrants & {
  status: RevenueCatAccessStatus;
  lifetimeProduct: ProductSnapshot | null;
  premiumProduct: ProductSnapshot | null;
  managementUrl: string | null;
  error: string | null;
};

const publicApiKey = (import.meta.env.VITE_REVENUECAT_WEB_API_KEY ?? "").trim();
const noGrants: RevenueCatGrants = { hasWriteAccess: false, hasPremiumAccess: false };
let purchasesQueue: Promise<Purchases | null> = Promise.resolve(null);

function unavailableSnapshot(message: string): Snapshot {
  return {
    ...noGrants,
    status: "unavailable",
    lifetimeProduct: null,
    premiumProduct: null,
    managementUrl: null,
    error: message,
  };
}

function errorSnapshot(message: string): Snapshot {
  return { ...unavailableSnapshot(message), status: "error" };
}

function grantsFor(customerInfo: CustomerInfo): RevenueCatGrants {
  const active = customerInfo.entitlements.active;
  const hasPremiumAccess = Boolean(active[REVENUECAT_PREMIUM_ENTITLEMENT_ID]);
  return {
    hasPremiumAccess,
    hasWriteAccess: hasPremiumAccess || Boolean(active[REVENUECAT_WRITE_ENTITLEMENT_ID]),
  };
}

function productSnapshot(rcPackage: RevenueCatPackage): ProductSnapshot {
  const product = rcPackage.webBillingProduct;
  const period = product.period;
  let cadence = "one-time";
  if (period) {
    const unit = period.number === 1 ? period.unit : `${period.unit}s`;
    cadence = period.number === 1 ? `every ${unit}` : `every ${period.number} ${unit}`;
  }
  return {
    title: product.title,
    description: product.description,
    price: product.price.formattedPrice,
    cadence,
    rcPackage,
  };
}

async function purchasesFor(appUserId: string): Promise<Purchases> {
  purchasesQueue = purchasesQueue
    .catch(() => null)
    .then(async (cached) => {
      const purchases =
        cached ??
        (Purchases.isConfigured()
          ? Purchases.getSharedInstance()
          : Purchases.configure({ apiKey: publicApiKey, appUserId }));
      if (purchases.getAppUserId() !== appUserId) {
        await purchases.changeUser(appUserId);
      }
      return purchases;
    });

  const purchases = await purchasesQueue;
  if (!purchases) throw new Error("RevenueCat did not initialize");
  return purchases;
}

async function loadSnapshot(appUserId: string): Promise<Snapshot> {
  const purchases = await purchasesFor(appUserId);
  const customerInfo = await purchases.getCustomerInfo();
  const grants = grantsFor(customerInfo);

  try {
    const offering = (await purchases.getOfferings()).current;
    const lifetimeProduct = offering?.lifetime ? productSnapshot(offering.lifetime) : null;
    const premiumProduct = offering?.monthly ? productSnapshot(offering.monthly) : null;
    if (!lifetimeProduct && !premiumProduct && !grants.hasWriteAccess) {
      return unavailableSnapshot("No products are configured in RevenueCat's current offering.");
    }
    return {
      ...grants,
      status: "ready",
      lifetimeProduct,
      premiumProduct,
      managementUrl: customerInfo.managementURL,
      error: null,
    };
  } catch {
    if (!grants.hasWriteAccess) throw new Error("Could not load purchase options");
    return {
      ...grants,
      status: "ready",
      lifetimeProduct: null,
      premiumProduct: null,
      managementUrl: customerInfo.managementURL,
      error: "Could not load upgrade options. Try again.",
    };
  }
}

export function useRevenueCatAccess(
  appUserId: string | null,
  customerEmail: string | null,
): RevenueCatAccess {
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    publicApiKey
      ? errorSnapshot("Sign in to check purchase access.")
      : unavailableSnapshot("Payments are not configured yet."),
  );
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!publicApiKey) {
      setSnapshot(unavailableSnapshot("Payments are not configured yet."));
      return;
    }
    if (!appUserId) {
      setSnapshot(errorSnapshot("Sign in to check purchase access."));
      return;
    }

    let cancelled = false;
    setSnapshot({
      ...noGrants,
      status: "loading",
      lifetimeProduct: null,
      premiumProduct: null,
      managementUrl: null,
      error: null,
    });
    void loadSnapshot(appUserId)
      .then((next) => {
        if (!cancelled) setSnapshot(next);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(errorSnapshot("Could not load purchase access. Try again."));
      });
    return () => {
      cancelled = true;
    };
  }, [appUserId]);

  const refresh = useCallback(async (): Promise<RevenueCatGrants> => {
    if (!publicApiKey || !appUserId) return noGrants;
    setIsBusy(true);
    setSnapshot((current) => ({ ...current, error: null }));
    try {
      const next = await loadSnapshot(appUserId);
      setSnapshot(next);
      return {
        hasWriteAccess: next.hasWriteAccess,
        hasPremiumAccess: next.hasPremiumAccess,
      };
    } catch {
      setSnapshot(errorSnapshot("Could not refresh purchase access. Try again."));
      return noGrants;
    } finally {
      setIsBusy(false);
    }
  }, [appUserId]);

  const purchase = useCallback(
    async (plan: RevenueCatPlan): Promise<PurchaseOutcome> => {
      const selected = plan === "premium" ? snapshot.premiumProduct : snapshot.lifetimeProduct;
      if (!publicApiKey || !appUserId || !selected) return "failed";
      setIsBusy(true);
      setSnapshot((current) => ({ ...current, error: null }));
      try {
        const purchases = await purchasesFor(appUserId);
        const result = await purchases.purchase({
          rcPackage: selected.rcPackage,
          customerEmail: customerEmail ?? undefined,
          skipSuccessPage: true,
        });
        const grants = grantsFor(result.customerInfo);
        const unlocked = plan === "premium" ? grants.hasPremiumAccess : grants.hasWriteAccess;
        if (unlocked) {
          setSnapshot((current) => ({
            ...current,
            ...grants,
            status: "ready",
            managementUrl: result.customerInfo.managementURL,
            error: null,
          }));
          return "unlocked";
        }

        const next = await loadSnapshot(appUserId);
        const refreshed = plan === "premium" ? next.hasPremiumAccess : next.hasWriteAccess;
        if (refreshed) {
          setSnapshot(next);
          return "unlocked";
        }
        const entitlement =
          plan === "premium" ? REVENUECAT_PREMIUM_ENTITLEMENT_ID : REVENUECAT_WRITE_ENTITLEMENT_ID;
        setSnapshot({
          ...next,
          error: `Purchase completed, but the ${entitlement} entitlement is not active.`,
        });
        return "failed";
      } catch (error) {
        const errorCode =
          typeof error === "object" && error !== null && "errorCode" in error
            ? error.errorCode
            : undefined;
        if (errorCode === 1) return "cancelled";
        setSnapshot((current) => ({
          ...current,
          error: "Payment did not complete. Try again.",
        }));
        return "failed";
      } finally {
        setIsBusy(false);
      }
    },
    [appUserId, customerEmail, snapshot.lifetimeProduct, snapshot.premiumProduct],
  );

  return {
    status: snapshot.status,
    hasWriteAccess: snapshot.hasWriteAccess,
    hasPremiumAccess: snapshot.hasPremiumAccess,
    lifetimeProduct: snapshot.lifetimeProduct,
    premiumProduct: snapshot.premiumProduct,
    managementUrl: snapshot.managementUrl,
    error: snapshot.error,
    isBusy,
    purchase,
    refresh,
  };
}
