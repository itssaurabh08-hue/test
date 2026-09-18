import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";

export default async function RootPage() {
  const session = await verifySession();
  redirect(session ? "/dashboard" : "/login");
}
