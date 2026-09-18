import { requireUser } from "@/lib/auth/dal";
import { DashboardNav } from "@/components/dashboard-nav";
import { MockModeBanner } from "@/components/mock-mode-banner";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <MockModeBanner />
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border md:flex md:flex-col">
          <div className="border-b border-border px-4 py-4">
            <p className="text-sm font-semibold">WhatsApp Bulk</p>
            <p className="text-xs text-muted-foreground">Meta Cloud API</p>
          </div>
          <DashboardNav />
          <div className="mt-auto border-t border-border p-3">
            <p className="truncate text-xs font-medium">{session.name}</p>
            <p className="truncate text-xs text-muted-foreground">{session.email}</p>
            <LogoutButton />
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
