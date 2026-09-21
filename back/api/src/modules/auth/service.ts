import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { createPrismaClient } from "../../../../prisma/client.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

export const ADMIN_SESSION_COOKIE = "smart_grocery_admin_session";
export const CLIENT_SESSION_COOKIE = "smart_grocery_client_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true"
      ? true
      : process.env.COOKIE_SECURE === "false"
        ? false
        : process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
  };
}

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

export async function createClientSession(prisma: PrismaClient, email: string, password: string, create = false) {
  const normalizedEmail = email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (create && !user) user = await prisma.user.create({ data: { email: normalizedEmail, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), role: "CLIENT" } });
  if (!user || user.role !== "CLIENT" || !(await argon2.verify(user.passwordHash, password))) return null;
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return token;
}

export async function getClientSession(prisma: PrismaClient, token?: string) {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  return session && session.expiresAt > new Date() && session.user.role === "CLIENT" ? session : null;
}
