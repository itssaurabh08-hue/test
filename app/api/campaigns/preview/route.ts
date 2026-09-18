import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { buildCampaignPreview } from "@/lib/campaigns/campaignService";
import type { MetaTemplate, MetaTemplateComponent } from "@/lib/meta/metaTemplates";

const bindingSchema = z.object({
  source: z.enum(["column", "static", "contactField"]),
  value: z.string(),
});

const mappingSchema = z.object({
  body: z.record(z.string(), bindingSchema),
  headerText: bindingSchema.optional(),
  headerMediaLink: bindingSchema.optional(),
  buttons: z.record(z.string(), bindingSchema).optional(),
});

const selectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("specific"), contactIds: z.array(z.string()).min(1) }),
]);

const bodySchema = z.object({
  templateName: z.string(),
  templateLanguage: z.string(),
  mapping: mappingSchema,
  selection: selectionSchema,
});

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { templateName, templateLanguage, mapping, selection } = parsed.data;

  const templateRow = await prisma.template.findUnique({
    where: { name_language: { name: templateName, language: templateLanguage } },
  });
  if (!templateRow) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (templateRow.status !== "APPROVED") {
    return NextResponse.json(
      { error: `Template is not approved (status: ${templateRow.status}).` },
      { status: 400 }
    );
  }

  const template: MetaTemplate = {
    name: templateRow.name,
    language: templateRow.language,
    category: templateRow.category,
    status: templateRow.status,
    components: templateRow.components as unknown as MetaTemplateComponent[],
  };

  const buttonsMapping = mapping.buttons
    ? Object.fromEntries(Object.entries(mapping.buttons).map(([k, v]) => [Number(k), v]))
    : undefined;

  const preview = await buildCampaignPreview(
    template,
    { ...mapping, buttons: buttonsMapping },
    selection
  );

  return NextResponse.json(preview);
}
