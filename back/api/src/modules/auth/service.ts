import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { createPrismaClient } from "../../../../prisma/client.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export const ADMIN_SESSION_COOKIE = "smart_grocery_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (
    !user ||
    user.role !== "ADMIN_MASTER" ||
    !(await argon2.verify(user.passwordHash, password))
  ) {
    return null;
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return token;
}

export async function getAdminSession(prisma: PrismaClient, token?: string) {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.role !== "ADMIN_MASTER"
  ) {
    return null;
  }

  return session;
}

export async function destroyAdminSession(prisma: PrismaClient, token?: string) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
