import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { z } from "zod";
import { createPrismaClient } from "../../prisma/client.js";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
} from "./modules/auth/service.js";

type PrismaClient = ReturnType<typeof createPrismaClient>;

type BuildAppOptions = {
  prisma?: PrismaClient;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const prisma =
    options.prisma ?? createPrismaClient(process.env.DATABASE_URL ?? "");

  await app.register(cookie);

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(request.body);

    if (!input.success) {
      return reply.code(400).send({ code: "INVALID_CREDENTIALS" });
    }

    const token = await createAdminSession(
      prisma,
      input.data.email,
      input.data.password,
    );
    if (!token) return reply.code(401).send({ code: "INVALID_CREDENTIALS" });

    reply.setCookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return reply.code(204).send();
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await destroyAdminSession(prisma, request.cookies[ADMIN_SESSION_COOKIE]);
    reply.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return { id: session.user.id, email: session.user.email, role: session.user.role };
  });

  app.get("/api/v1/admin/dashboard/overview", async (request, reply) => {
    const session = await getAdminSession(
      prisma,
      request.cookies[ADMIN_SESSION_COOKIE],
    );
    if (!session) return reply.code(401).send({ code: "UNAUTHORIZED" });
    return { status: "authorized" };
  });

  return app;
}
