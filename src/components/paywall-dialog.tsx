import { Check, Crown, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  RevenueCatAccess,
  RevenueCatPlan,
  RevenueCatProduct,
} from "@/lib/billing/use-revenuecat";
import { cn } from "@/lib/utils";

export function PaywallDialog({
  open,
  onOpenChange,
  access,
  requiredAccess,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access: RevenueCatAccess;
  requiredAccess: "write" | "premium";
  onUnlocked: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<RevenueCatPlan>("lifetime");
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRestoreMessage(null);
    setSelectedPlan(requiredAccess === "premium" ? "premium" : "lifetime");
  }, [open, requiredAccess]);

  const requiredUnlocked =
    requiredAccess === "premium" ? access.hasPremiumAccess : access.hasWriteAccess;
  const selectedProduct =
    selectedPlan === "premium" ? access.premiumProduct : access.lifetimeProduct;
  const plans: {
    id: RevenueCatPlan;
    label: string;
    detail: string;
    product: RevenueCatProduct | null;
  }[] =
    requiredAccess === "premium"
      ? [
          {
            id: "premium",
            label: "Premium",
            detail: "Daily background sync and manual writes",
            product: access.premiumProduct,
          },
        ]
      : [
          {
            id: "lifetime",
            label: "One-time",
            detail: "Manual writes and script downloads",
            product: access.lifetimeProduct,
          },
          {
            id: "premium",
            label: "Premium",
            detail: "Daily background sync and manual writes",
            product: access.premiumProduct,
          },
        ];

  async function purchase() {
    const outcome = await access.purchase(selectedPlan);
    if (outcome === "unlocked") onUnlocked();
  }

  async function restore() {
    const grants = await access.refresh();
    const unlocked = requiredAccess === "premium" ? grants.hasPremiumAccess : grants.hasWriteAccess;
    if (unlocked) {
      onUnlocked();
      return;
    }
    setRestoreMessage("No matching active purchase was found for this GitHub account.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted ring-1 ring-border">
            {requiredUnlocked ? (
              <Check className="size-5 text-graph-4" />
            ) : requiredAccess === "premium" ? (
              <Crown className="size-5" />
            ) : (
              <LockKeyhole className="size-5" />
            )}
          </div>
          <DialogTitle>
            {requiredAccess === "premium" ? "Keep your graph in sync" : "Unlock writing"}
          </DialogTitle>
          <DialogDescription>
            {requiredAccess === "premium"
              ? "Greenkeep checks your work accounts every day and adds only the commits that are still missing."
              : "Your merged history stays free to preview. Choose a one-time manual unlock or automatic Premium sync."}
          </DialogDescription>
        </DialogHeader>

        {access.status === "loading" && (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Checking purchase access
          </div>
        )}

        {access.status === "ready" && !requiredUnlocked && (
          <div className="grid gap-2 sm:grid-cols-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={!plan.product}
                aria-pressed={selectedPlan === plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={cn(
                  "rounded-lg p-3 text-left ring-1 transition-colors",
                  selectedPlan === plan.id
                    ? "bg-muted ring-foreground/30"
                    : "ring-border hover:bg-muted/60",
                  !plan.product && "cursor-not-allowed opacity-50",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{plan.label}</p>
                    <p className="mt-1 text-2xs text-muted-foreground">{plan.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-medium">
                      {plan.product?.price ?? "Unavailable"}
                    </p>
                    {plan.product && (
                      <p className="text-2xs text-muted-foreground">{plan.product.cadence}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {requiredUnlocked && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            {requiredAccess === "premium"
              ? "Premium automatic sync is available for this account."
              : "Writing is unlocked for this account."}
          </div>
        )}

        {(access.status === "unavailable" || access.status === "error") && (
          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {access.error ?? "Payments are temporarily unavailable."}
          </div>
        )}

        {access.error && access.status === "ready" && (
          <p className="text-xs text-destructive">{access.error}</p>
        )}
        {restoreMessage && <p className="text-xs text-muted-foreground">{restoreMessage}</p>}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void restore()}
            disabled={access.isBusy || access.status === "loading"}
          >
            {access.isBusy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Restore access
          </Button>
          {requiredUnlocked ? (
            <Button type="button" onClick={onUnlocked}>
              Continue
            </Button>
          ) : access.status === "error" ? (
            <Button type="button" onClick={() => void access.refresh()} disabled={access.isBusy}>
              {access.isBusy ? <LoaderCircle className="animate-spin" /> : null}
              Try again
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void purchase()}
              disabled={!selectedProduct || access.isBusy || access.status !== "ready"}
            >
              {access.isBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : selectedPlan === "premium" ? (
                <Crown />
              ) : (
                <LockKeyhole />
              )}
              {selectedPlan === "premium" ? "Start Premium" : "Unlock writing"}
              {selectedProduct ? ` · ${selectedProduct.price}` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
