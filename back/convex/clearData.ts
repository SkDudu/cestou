/**
 * One-shot wipe for flyer tables. Legacy catalog tables must be cleared
 * via Dashboard or by temporarily restoring them in schema before deploy.
 *
 * npx convex run clearData:wipeAll
 */
import { mutation } from "./_generated/server";

export const wipeAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "offers",
      "flyerPages",
      "flyerErrors",
      "flyers",
      "flyerSources",
      "supermarkets",
    ] as const;
    const deleted: Record<string, number> = {};
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      deleted[table] = rows.length;
    }
    return deleted;
  },
});
