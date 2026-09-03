import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getDefaultLocation, requireAuth } from "./clientLib";

export const getMyDefaultLocation = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await getDefaultLocation(ctx, userId);
  },
});

export const upsertLocation = mutation({
  args: {
    label: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    neighborhood: v.optional(v.string()),
    addressText: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();
    const city = args.city.trim();
    const state = args.state.trim().toUpperCase();
    if (!city || !state) throw new Error("city and state required");

    const current = await getDefaultLocation(ctx, userId);
    if (current) {
      await ctx.db.patch(current._id, {
        label: args.label?.trim() || current.label,
        city,
        state,
        neighborhood: args.neighborhood?.trim() || undefined,
        addressText: args.addressText?.trim() || undefined,
        lat: args.lat,
        lng: args.lng,
        isDefault: true,
        updatedAt: now,
      });
      return current._id;
    }

    return await ctx.db.insert("locations", {
      userId,
      label: args.label?.trim() || "Casa",
      city,
      state,
      neighborhood: args.neighborhood?.trim() || undefined,
      addressText: args.addressText?.trim() || undefined,
      lat: args.lat,
      lng: args.lng,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});
