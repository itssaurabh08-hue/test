import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SyncTemplatesButton } from "./sync-button";
import { extractBodyVariableIndexes } from "@/lib/meta/templatePayload";
import type { MetaTemplate, MetaTemplateComponent } from "@/lib/meta/metaTemplates";

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
            Approved Meta message templates for your WhatsApp Business Account. Only
            APPROVED templates can be used to start a campaign.
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
          {templates.map((t) => {
            const components = t.components as unknown as MetaTemplateComponent[];
            const template: MetaTemplate = {
              name: t.name,
              language: t.language,
              category: t.category,
              status: t.status,
              components,
            };
            const body = components.find((c) => c.type === "BODY");
            const header = components.find((c) => c.type === "HEADER");
            const buttons = components.find((c) => c.type === "BUTTONS");
            const variableCount = extractBodyVariableIndexes(template).length;

            return (
              <Card key={t.id}>
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.language} · {t.category}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge>
                  </div>

                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    {header?.text ? <p className="font-medium">{header.text}</p> : null}
                    {header?.format && header.format !== "TEXT" ? (
                      <p className="text-xs text-muted-foreground">[{header.format} header]</p>
                    ) : null}
                    {body?.text ? <p className="whitespace-pre-wrap">{body.text}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{variableCount} body variable{variableCount === 1 ? "" : "s"}</span>
                    {buttons?.buttons?.length ? <span>· {buttons.buttons.length} button(s)</span> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
