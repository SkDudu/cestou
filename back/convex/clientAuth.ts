import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Cria ou reusa user anônimo via sessionToken (localStorage). */
export const ensureSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const token = args.sessionToken.trim();
    if (!token) throw new Error("sessionToken required");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", token))
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("users", {
      sessionToken: token,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getMe = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => ctx.db.get(args.userId),
});
