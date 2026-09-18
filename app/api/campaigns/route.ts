import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/dal";
import { prisma } from "@/lib/db/prisma";
import { ipFromHeaders } from "@/lib/audit";
import { createCampaignDraft, CampaignCreationError } from "@/lib/campaigns/campaignService";

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
  name: z.string().min(1).max(200),
  templateName: z.string(),
  templateLanguage: z.string(),
  mapping: mappingSchema,
  selection: selectionSchema,
  confirmed: z.literal(true),
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
  const { name, templateName, templateLanguage, mapping, selection } = parsed.data;

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

  const buttonsMapping = mapping.buttons
    ? Object.fromEntries(Object.entries(mapping.buttons).map(([k, v]) => [Number(k), v]))
    : undefined;

  try {
    const result = await createCampaignDraft({
      name,
      templateName,
      templateLanguage,
      templateCategory: templateRow.category,
      mapping: { ...mapping, buttons: buttonsMapping },
      selection,
      userId: session.userId,
      ipAddress: ipFromHeaders(request.headers),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignCreationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Failed to create campaign", err);
    return NextResponse.json({ error: "Failed to create campaign." }, { status: 500 });
  }
}
