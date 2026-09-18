"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { verifySession } from "@/lib/auth/dal";
import { writeAuditLog, ipFromHeaders } from "@/lib/audit";
import { isLoginRateLimited, recordFailedLogin, clearLoginAttempts } from "@/lib/auth/loginRateLimit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const { email, password } = parsed.data;
  const ip = ipFromHeaders(await headers());

  if (await isLoginRateLimited(email)) {
    await writeAuditLog({
      action: "USER_LOGIN_FAILED",
      resource: "User",
      metadata: { email, reason: "rate_limited" },
      ipAddress: ip,
    });
    return { error: "Too many failed attempts. Try again in a few minutes." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await recordFailedLogin(email);
    await writeAuditLog({
      action: "USER_LOGIN_FAILED",
      resource: "User",
      metadata: { email },
      ipAddress: ip,
    });
    return { error: "Invalid email or password." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(email);
    await writeAuditLog({
      userId: user.id,
      action: "USER_LOGIN_FAILED",
      resource: "User",
      resourceId: user.id,
      ipAddress: ip,
    });
    return { error: "Invalid email or password." };
  }

  await clearLoginAttempts(email);
  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  await writeAuditLog({
    userId: user.id,
    action: "USER_LOGIN",
    resource: "User",
    resourceId: user.id,
    ipAddress: ip,
  });

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const session = await verifySession();
  await destroySession();
  if (session) {
    await writeAuditLog({
      userId: session.userId,
      action: "USER_LOGOUT",
      resource: "User",
      resourceId: session.userId,
    });
  }
  redirect("/login");
}
