import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const db = new PrismaClient();

function hashPassword(password: string, salt: string) {
  return crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
}

function makeStoredPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${hashPassword(password, salt)}`;
}

async function main() {
  const storedPassword = makeStoredPassword("admin123");

  const user = await db.user.upsert({
    where: { email: "admin@i2i.studio" },
    update: { role: "ADMIN", password: storedPassword },
    create: {
      email: "admin@i2i.studio",
      name: "Admin",
      password: storedPassword,
      role: "ADMIN",
      credits: 9999,
    },
  });

  console.log("Seeded user:", user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
