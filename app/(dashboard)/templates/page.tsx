import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SyncTemplatesButton } from "./sync-button";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  PAUSED: "warning",
  DISABLED: "destructive",
};

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Approved Meta message templates for your WhatsApp Business Account.
          </p>
        </div>
        <SyncTemplatesButton />
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No templates synced yet. Click &ldquo;Sync from Meta&rdquo; to fetch templates from your WABA.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.language} · {t.category}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
