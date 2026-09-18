import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Standalone Node script (run via `tsx`, outside the Next.js build), so it
// uses its own PrismaClient instance rather than the `server-only`-guarded
// singleton in lib/db/prisma.ts.
const prisma = new PrismaClient();
const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set (in .env) to seed the admin user."
    );
  }
  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, role: "ADMIN" },
  });

  console.log(`Seeded admin user: ${user.email} (${user.id})`);

  const defaultRates: Array<{ country: string; category: string; price: number }> = [
    { country: "IN", category: "MARKETING", price: 0.78 },
    { country: "IN", category: "UTILITY", price: 0.115 },
    { country: "IN", category: "AUTHENTICATION", price: 0.115 },
    { country: "IN", category: "SERVICE", price: 0 },
  ];

  for (const rate of defaultRates) {
    await prisma.pricingRate.upsert({
      where: { country_category: { country: rate.country, category: rate.category } },
      update: {},
      create: { ...rate, currency: "USD" },
    });
  }
  console.log("Seeded default pricing rates (illustrative placeholders — verify against Meta's published rate card before relying on cost estimates).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
