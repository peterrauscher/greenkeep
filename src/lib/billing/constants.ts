/**
 * Master switch for the RevenueCat paywall. `false` = free tool: server checks
 * grant every entitlement and the client never initializes RevenueCat.
 */
export const BILLING_ENABLED = false;

export const REVENUECAT_WRITE_ENTITLEMENT_ID = "pro";
export const REVENUECAT_PREMIUM_ENTITLEMENT_ID = "premium";

export const PAYMENT_REQUIRED_MESSAGE = "Unlock Greenkeep to write commits.";
export const PREMIUM_REQUIRED_MESSAGE = "Premium is required for automatic sync.";
export const BILLING_UNAVAILABLE_MESSAGE = "Could not verify your purchase. Try again.";
