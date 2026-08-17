import { internalMutation } from "./_generated/server";

/** Expire only. nextRunAt is armed by a successful flyer flow (validUntil). */
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
        await ctx.db.patch(f._id, { status: "expired", updatedAt: now });
        expired++;
      }
    }
    return { expired };
  },
});
