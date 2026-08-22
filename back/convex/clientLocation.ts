import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getDefaultLocation, requireUser } from "./clientLib";

export const getMyDefaultLocation = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    return await getDefaultLocation(ctx, args.userId);
  },
});

export const upsertLocation = mutation({
  args: {
    userId: v.id("users"),
    label: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    neighborhood: v.optional(v.string()),
    addressText: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.userId);
    const now = Date.now();
    const city = args.city.trim();
    const state = args.state.trim().toUpperCase();
    if (!city || !state) throw new Error("city and state required");

    const current = await getDefaultLocation(ctx, args.userId);
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
      userId: args.userId,
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
