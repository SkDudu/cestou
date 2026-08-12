import { internalMutation } from "./_generated/server";

/** Cron entry — same logic as flyers.markExpired */
export const markExpiredInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const flyers = await ctx.db.query("flyers").collect();
    let count = 0;
    for (const f of flyers) {
      if (
        f.validUntil !== undefined &&
        f.validUntil < now &&
        f.status !== "expired" &&
        f.status !== "failed"
      ) {
        await ctx.db.patch(f._id, { status: "expired", updatedAt: now });
        count++;
      }
    }
    return { expired: count };
  },
});
