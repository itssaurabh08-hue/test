// No `server-only` guard — see the comment in lib/db/prisma.ts.
import type { Contact, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit";
import type { MetaTemplate } from "@/lib/meta/metaTemplates";
import { resolveVariablesForContact, type VariableMappingConfig } from "@/lib/templates/variableMapping";
import { renderTemplatePreview, type RenderedPreview } from "@/lib/campaigns/preview";

export type RecipientSelection =
  | { type: "all" }
  | { type: "specific"; contactIds: string[] };

export interface EligibleContactsResult {
  totalSelected: number;
  optedOutExcluded: number;
  eligible: Contact[];
}

/** Resolves a recipient selection into the actual contact rows, excluding opted-out contacts automatically. */
export async function getEligibleContacts(
  selection: RecipientSelection
): Promise<EligibleContactsResult> {
  if (selection.type === "all") {
    const [totalSelected, eligible] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.findMany({ where: { optedOut: false } }),
    ]);
    return { totalSelected, optedOutExcluded: totalSelected - eligible.length, eligible };
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: selection.contactIds } },
  });
  const eligible = contacts.filter((c) => !c.optedOut);
  return {
    totalSelected: selection.contactIds.length,
    optedOutExcluded: contacts.length - eligible.length,
    eligible,
  };
}

export interface RecipientVariableResult {
  contact: Contact;
  resolvedBody: Record<string, string>;
  headerText?: string;
  headerMediaLink?: string;
  buttons?: Record<number, string>;
  missing: string[];
}

export function resolveVariablesForContacts(
  contacts: Contact[],
  mapping: VariableMappingConfig
): RecipientVariableResult[] {
  return contacts.map((contact) => {
    const resolved = resolveVariablesForContact(mapping, {
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      metadata: (contact.metadata as Record<string, unknown>) ?? {},
    });
    return {
      contact,
      resolvedBody: resolved.input.body ?? {},
      headerText: resolved.input.headerText,
      headerMediaLink: resolved.input.headerMediaLink,
      buttons: resolved.input.buttons,
      missing: resolved.missing,
    };
  });
}

export interface CampaignPreviewData {
  totalSelected: number;
  optedOutExcluded: number;
  eligibleCount: number;
  missingVariableCount: number;
  estimatedCost: { amount: number; currency: string } | null;
  samplePreviews: Array<{ contactId: string; name: string; phone: string; preview: RenderedPreview }>;
}

export async function buildCampaignPreview(
  template: MetaTemplate,
  mapping: VariableMappingConfig,
  selection: RecipientSelection
): Promise<CampaignPreviewData> {
  const { totalSelected, optedOutExcluded, eligible } = await getEligibleContacts(selection);
  const resolvedList = resolveVariablesForContacts(eligible, mapping);
  const missingVariableCount = resolvedList.filter((r) => r.missing.length > 0).length;

  const estimatedCost = await estimateCampaignCost(template.category, eligible.length);

  const samplePreviews = resolvedList.slice(0, 10).map((r) => ({
    contactId: r.contact.id,
    name: r.contact.name,
    phone: r.contact.phone,
    preview: renderTemplatePreview(template, {
      input: {
        body: r.resolvedBody,
        headerText: r.headerText,
        headerMediaLink: r.headerMediaLink,
        buttons: r.buttons,
      },
      missing: r.missing,
    }),
  }));

  return {
    totalSelected,
    optedOutExcluded,
    eligibleCount: eligible.length,
    missingVariableCount,
    estimatedCost,
    samplePreviews,
  };
}

async function estimateCampaignCost(
  category: string,
  recipientCount: number
): Promise<{ amount: number; currency: string } | null> {
  // Single default country for now (DEFAULT_COUNTRY_CODE) — the pricing
  // table supports per-country rates if this is extended later.
  const rate = await prisma.pricingRate.findFirst({
    where: { category },
    orderBy: { updatedAt: "desc" },
  });
  if (!rate) return null;
  return { amount: Number(rate.price) * recipientCount, currency: rate.currency };
}

export interface CreateCampaignInput {
  name: string;
  templateName: string;
  templateLanguage: string;
  templateCategory: string;
  mapping: VariableMappingConfig;
  selection: RecipientSelection;
  userId: string;
  ipAddress?: string | null;
}

export class CampaignCreationError extends Error {}

export async function createCampaignDraft(
  input: CreateCampaignInput
): Promise<{ id: string; eligibleCount: number }> {
  const { eligible } = await getEligibleContacts(input.selection);
  if (eligible.length === 0) {
    throw new CampaignCreationError("No eligible recipients selected.");
  }

  const resolvedList = resolveVariablesForContacts(eligible, input.mapping);
  const missing = resolvedList.filter((r) => r.missing.length > 0);
  if (missing.length > 0) {
    throw new CampaignCreationError(
      `${missing.length} recipient(s) have missing template variables. Fix the mapping or remove them from the selection before sending.`
    );
  }

  const estimatedCost = await estimateCampaignCost(input.templateCategory, eligible.length);

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        name: input.name,
        templateName: input.templateName,
        templateLanguage: input.templateLanguage,
        templateCategory: input.templateCategory,
        status: "DRAFT",
        variableMapping: input.mapping as unknown as Prisma.InputJsonValue,
        selectionFilter: input.selection as unknown as Prisma.InputJsonValue,
        totalContacts: eligible.length,
        estimatedCostAmount: estimatedCost?.amount ?? null,
        estimatedCostCurrency: estimatedCost?.currency ?? null,
        confirmedAt: new Date(),
        createdById: input.userId,
      },
    });

    await tx.campaignRecipient.createMany({
      data: resolvedList.map((r) => ({
        campaignId: created.id,
        contactId: r.contact.id,
        phone: r.contact.phone,
        variables: {
          body: r.resolvedBody,
          headerText: r.headerText ?? null,
          headerMediaLink: r.headerMediaLink ?? null,
          buttons: r.buttons ?? null,
        } as unknown as Prisma.InputJsonValue,
        status: "PENDING",
      })),
    });

    return created;
  });

  await writeAuditLog({
    userId: input.userId,
    action: "CAMPAIGN_CREATED",
    resource: "Campaign",
    resourceId: campaign.id,
    metadata: {
      name: input.name,
      templateName: input.templateName,
      recipientCount: eligible.length,
    },
    ipAddress: input.ipAddress,
  });

  return { id: campaign.id, eligibleCount: eligible.length };
}
