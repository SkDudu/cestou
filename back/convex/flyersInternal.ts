import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  FLYER_RETENTION_MS,
  purgeFlyerEvidence,
  wipeFlyer,
} from "./flyers";
import {
  armDiscoveryForSupermarket,
  armPeriodicDiscovery,
} from "./scraperFlows";
import { reapStaleRuns } from "./scraperRuns";

const DISCOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Hourly lifecycle: expire flyers by validUntil, purge evidence after 30 days,
 * and arm site checks (new flyers + validade) at least every 6h.
 */
export const checkFlyerLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    await reapStaleRuns(ctx, now);
    const flyers = await ctx.db.query("flyers").collect();
    let expired = 0;
    const marketsToDiscover = new Set<Id<"supermarkets">>();
    for (const f of flyers) {
      if (
        f.validUntil !== undefined &&
        f.validUntil < now &&
        f.status !== "expired" &&
        f.status !== "failed" &&
        f.status !== "downloading" &&
        f.status !== "processing"
      ) {
        await ctx.db.patch(f._id, {
          status: "expired",
          expiredAt: now,
          updatedAt: now,
        });
        expired++;
        const hasUpcoming = flyers.some(
          (candidate) =>
            candidate.supermarketId === f.supermarketId &&
            candidate.status !== "expired" &&
            candidate.status !== "failed" &&
            candidate.validFrom !== undefined &&
            candidate.validFrom > now,
        );
        if (!hasUpcoming) marketsToDiscover.add(f.supermarketId);
      }
    }

    for (const flyer of flyers) {
      if (
        flyer.status !== "expired" &&
        flyer.status !== "failed" &&
        flyer.validUntil !== undefined &&
        flyer.validUntil >= now &&
        flyer.validUntil <= now + DISCOVERY_WINDOW_MS
      ) {
        marketsToDiscover.add(flyer.supermarketId);
      }
    }
    for (const supermarketId of marketsToDiscover) {
      await armDiscoveryForSupermarket(ctx, supermarketId, now);
    }
    await armPeriodicDiscovery(ctx);

    const cutoff = now - FLYER_RETENTION_MS;
    const stale = flyers.filter(
      (f) =>
        f.status === "expired" &&
        f.validUntil !== undefined &&
        f.validUntil <= cutoff,
    );
    let offersPreserved = 0;
    for (const flyer of stale) {
      const result = await purgeFlyerEvidence(ctx, flyer, true);
      offersPreserved += result.offers;
    }

    const duplicates = flyers.filter((f) => f.status === "duplicate");
    for (const flyer of duplicates) await wipeFlyer(ctx, flyer._id);

    return {
      expired,
      flyersPurged: stale.length,
      duplicatesPurged: duplicates.length,
      offersPreserved,
    };
  },
});
