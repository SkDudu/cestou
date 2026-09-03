import { internalMutation } from "./_generated/server";
import { FLYER_RETENTION_MS, purgeFlyerEvidence } from "./flyers";

/**
 * Hourly lifecycle: expire finished flyers and purge evidence after 30 days.
 * Offers are deliberately retained as historical data by the purge.
 */
export const checkFlyerLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const flyers = await ctx.db.query("flyers").collect();
    let expired = 0;
    for (const f of flyers) {
      if (
        f.validUntil !== undefined &&
        f.validUntil < now &&
        f.status !== "expired" &&
        f.status !== "failed"
      ) {
        await ctx.db.patch(f._id, {
          status: "expired",
          expiredAt: now,
          updatedAt: now,
        });
        expired++;
      }
    }

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
    return { expired, flyersPurged: stale.length, offersPreserved };
  },
});
