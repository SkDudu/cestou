import argon2 from "argon2";

export type SeedEnvironment = {
  ADMIN_MASTER_EMAIL: string;
  ADMIN_SEED_PASSWORD: string;
};

type UserUpsert = {
  where: { email: string };
  update: { role: "ADMIN_MASTER"; passwordHash: string };
  create: { email: string; role: "ADMIN_MASTER"; passwordHash: string };
};

type SeedPrisma = {
  user: {
    upsert(input: UserUpsert): Promise<unknown>;
  };
};

export async function seedMasterAdmin(
  prisma: SeedPrisma,
  env: SeedEnvironment,
) {
  const email = env.ADMIN_MASTER_EMAIL.trim().toLowerCase();
  const passwordHash = await argon2.hash(env.ADMIN_SEED_PASSWORD, {
    type: argon2.argon2id,
  });

  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN_MASTER", passwordHash },
    create: { email, role: "ADMIN_MASTER", passwordHash },
  });
}
