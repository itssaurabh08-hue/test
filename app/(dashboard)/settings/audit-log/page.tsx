import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";

export default async function AuditLogPage() {
  await requireAdmin();

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          The most recent 200 actions. Never contains access tokens, app secrets, or passwords.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Resource</th>
                  <th className="px-4 py-2 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">{log.user?.email ?? "system"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.resource}
                      {log.resourceId ? ` (${log.resourceId.slice(0, 10)}…)` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
