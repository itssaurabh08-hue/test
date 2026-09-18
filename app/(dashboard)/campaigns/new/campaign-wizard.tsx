"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  extractBodyVariableIndexes,
  getHeaderComponent,
  headerHasVariable,
  getButtonsRequiringParameters,
} from "@/lib/meta/templatePayload";
import type { MetaTemplateComponent } from "@/lib/meta/metaTemplates";

type Step = "template" | "recipients" | "mapping" | "preview" | "done";

interface TemplateRow {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: MetaTemplateComponent[];
}

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  optedOut: boolean;
  source: string;
  metadata: Record<string, unknown>;
}

type BindingSource = "column" | "static" | "contactField";
interface Binding {
  source: BindingSource;
  value: string;
}
interface Mapping {
  body: Record<string, Binding>;
  headerText?: Binding;
  buttons?: Record<number, Binding>;
}

interface PreviewData {
  totalSelected: number;
  optedOutExcluded: number;
  eligibleCount: number;
  missingVariableCount: number;
  estimatedCost: { amount: number; currency: string } | null;
  samplePreviews: Array<{
    contactId: string;
    name: string;
    phone: string;
    preview: { headerLine: string | null; bodyText: string; footerText: string | null; missing: string[] };
  }>;
}

const CONTACT_FIELD_OPTIONS = [
  { value: "name", label: "Contact: Name" },
  { value: "phone", label: "Contact: Phone" },
  { value: "email", label: "Contact: Email" },
];

export function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("template");
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);

  const [recipientMode, setRecipientMode] = useState<"all" | "specific">("all");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsMeta, setContactsMeta] = useState<{ total: number; optedOutCount: number }>({
    total: 0,
    optedOutCount: 0,
  });
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [contactsLoading, setContactsLoading] = useState(true);

  const [mapping, setMapping] = useState<Mapping>({ body: {} });

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [campaignName, setCampaignName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  // ---- Load templates ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates?approvedOnly=true");
        const data = await res.json();
        if (res.ok) setTemplates(data.templates);
      } finally {
        setTemplatesLoading(false);
      }
    })();
  }, []);

  // ---- Load contacts once, eagerly (used for both "specific" recipient
  // picking and column suggestions in the mapping step) ----
  useEffect(() => {
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => {
        setContacts(data.contacts ?? []);
        setContactsMeta({ total: data.total ?? 0, optedOutCount: data.optedOutCount ?? 0 });
      })
      .finally(() => setContactsLoading(false));
  }, []);

  // ---- Re-fetch (debounced) when the user searches on the recipients step.
  // This intentionally does NOT cancel-and-lose the initial eager fetch
  // above — it only re-filters the picker list while the user is typing. ----
  useEffect(() => {
    if (step !== "recipients" || !contactSearch) return;
    const params = new URLSearchParams({ search: contactSearch });
    const handle = setTimeout(() => {
      setContactsLoading(true);
      fetch(`/api/contacts?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setContacts(data.contacts ?? []))
        .finally(() => setContactsLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [step, contactSearch]);

  const availableColumns = useMemo(() => {
    const cols = new Set<string>();
    for (const c of contacts) {
      for (const key of Object.keys(c.metadata ?? {})) cols.add(key);
    }
    return [...cols].sort();
  }, [contacts]);

  const bodyIndexes = selectedTemplate ? extractBodyVariableIndexes(toMetaTemplate(selectedTemplate)) : [];
  const header = selectedTemplate ? getHeaderComponent(toMetaTemplate(selectedTemplate)) : undefined;
  const needsHeaderVar = selectedTemplate ? headerHasVariable(toMetaTemplate(selectedTemplate)) : false;
  const buttonsNeedingParams = selectedTemplate
    ? getButtonsRequiringParameters(toMetaTemplate(selectedTemplate))
    : [];

  function mappingComplete(): boolean {
    if (!selectedTemplate) return false;
    if (bodyIndexes.some((i) => !mapping.body[String(i)]?.value)) return false;
    if (needsHeaderVar && !mapping.headerText?.value) return false;
    if (buttonsNeedingParams.some((b) => !mapping.buttons?.[b.index]?.value)) return false;
    return true;
  }

  async function runPreview() {
    if (!selectedTemplate) return;
    setPreviewLoading(true);
    setError(null);
    try {
      const selection =
        recipientMode === "all"
          ? { type: "all" as const }
          : { type: "specific" as const, contactIds: [...selectedContactIds] };
      const res = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          mapping,
          selection,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to build preview.");
      setPreviewData(data);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedTemplate) return;
    setCreating(true);
    setError(null);
    try {
      const selection =
        recipientMode === "all"
          ? { type: "all" as const }
          : { type: "specific" as const, contactIds: [...selectedContactIds] };
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          mapping,
          selection,
          confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create campaign.");
      setCreatedCampaignId(data.id);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <StepIndicator step={step} />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {step === "template" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Select a template</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {templatesLoading ? (
              <p className="text-sm text-muted-foreground">Loading templates…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved templates available. Sync templates from the Templates page first.
              </p>
            ) : (
              templates.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-accent/40 has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    name="template"
                    className="mt-1"
                    checked={selectedTemplate?.id === t.id}
                    onChange={() => setSelectedTemplate(t)}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {t.name} <span className="text-xs text-muted-foreground">({t.language})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{t.category}</p>
                  </div>
                </label>
              ))
            )}
            <div className="flex justify-end">
              <Button disabled={!selectedTemplate} onClick={() => setStep("recipients")}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "recipients" && (
        <Card>
          <CardHeader>
            <CardTitle>2. Select recipients</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={recipientMode === "all"}
                  onChange={() => setRecipientMode("all")}
                />
                All contacts ({contactsMeta.total - contactsMeta.optedOutCount} eligible of{" "}
                {contactsMeta.total}, {contactsMeta.optedOutCount} opted out)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={recipientMode === "specific"}
                  onChange={() => setRecipientMode("specific")}
                />
                Specific contacts ({selectedContactIds.size} selected)
              </label>
            </div>

            {recipientMode === "specific" && (
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Search by name or phone…"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                />
                <div className="max-h-72 overflow-auto rounded-md border border-border">
                  {contactsLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">Loading…</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border">
                        {contacts.map((c) => (
                          <tr key={c.id} className={c.optedOut ? "opacity-50" : ""}>
                            <td className="px-3 py-2">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  disabled={c.optedOut}
                                  checked={selectedContactIds.has(c.id)}
                                  onChange={(e) => {
                                    setSelectedContactIds((prev) => {
                                      const next = new Set(prev);
                                      if (e.target.checked) next.add(c.id);
                                      else next.delete(c.id);
                                      return next;
                                    });
                                  }}
                                />
                                {c.name}
                                <span className="text-xs text-muted-foreground">{c.phone}</span>
                                {c.optedOut ? <Badge variant="destructive">Opted out</Badge> : null}
                              </label>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("template")}>
                Back
              </Button>
              <Button
                disabled={recipientMode === "specific" && selectedContactIds.size === 0}
                onClick={() => setStep("mapping")}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>3. Map template variables</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {needsHeaderVar && header && (
              <BindingRow
                label="Header variable"
                columns={availableColumns}
                binding={mapping.headerText}
                onChange={(b) => setMapping((m) => ({ ...m, headerText: b }))}
              />
            )}
            {bodyIndexes.map((idx) => (
              <BindingRow
                key={idx}
                label={`Body {{${idx}}}`}
                columns={availableColumns}
                binding={mapping.body[String(idx)]}
                onChange={(b) =>
                  setMapping((m) => ({ ...m, body: { ...m.body, [String(idx)]: b } }))
                }
              />
            ))}
            {buttonsNeedingParams.map((btn) => (
              <BindingRow
                key={btn.index}
                label={`Button ${btn.index + 1} (${btn.text ?? "URL"})`}
                columns={availableColumns}
                binding={mapping.buttons?.[btn.index]}
                onChange={(b) =>
                  setMapping((m) => ({
                    ...m,
                    buttons: { ...(m.buttons ?? {}), [btn.index]: b },
                  }))
                }
              />
            ))}
            {bodyIndexes.length === 0 && !needsHeaderVar && buttonsNeedingParams.length === 0 && (
              <p className="text-sm text-muted-foreground">
                This template has no variables to map — every recipient gets the same message.
              </p>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("recipients")}>
                Back
              </Button>
              <Button disabled={!mappingComplete() || previewLoading} onClick={runPreview}>
                {previewLoading ? "Loading preview…" : "Preview"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && previewData && (
        <Card>
          <CardHeader>
            <CardTitle>4. Preview &amp; confirm</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Selected" value={previewData.totalSelected} />
              <Stat label="Opted-out excluded" value={previewData.optedOutExcluded} variant="warning" />
              <Stat label="Eligible recipients" value={previewData.eligibleCount} variant="success" />
              <Stat
                label="Missing variables"
                value={previewData.missingVariableCount}
                variant={previewData.missingVariableCount > 0 ? "destructive" : undefined}
              />
            </div>

            {previewData.estimatedCost ? (
              <p className="text-sm text-muted-foreground">
                Estimated cost: {previewData.estimatedCost.amount.toFixed(2)}{" "}
                {previewData.estimatedCost.currency} (illustrative — not the actual Meta invoice)
              </p>
            ) : null}

            {previewData.missingVariableCount > 0 && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {previewData.missingVariableCount} recipient(s) have missing template variables and
                must be fixed (adjust the mapping, or deselect those contacts) before this campaign
                can be sent.
              </p>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Sample previews</p>
              <div className="flex flex-col gap-2">
                {previewData.samplePreviews.map((p) => (
                  <div key={p.contactId} className="rounded-md border border-border p-3 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      {p.name} · {p.phone}
                    </p>
                    {p.preview.headerLine ? (
                      <p className="font-medium">{p.preview.headerLine}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap">{p.preview.bodyText}</p>
                    {p.preview.footerText ? (
                      <p className="text-xs text-muted-foreground">{p.preview.footerText}</p>
                    ) : null}
                    {p.preview.missing.length > 0 && (
                      <p className="mt-1 text-xs text-destructive">
                        Missing: {p.preview.missing.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input
                id="campaign-name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Sports Day invitations — Sept 2026"
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" id="confirm-campaign" className="mt-0.5" required />
              <span>
                I confirm that these recipients are authorised/consented contacts for this
                WhatsApp communication and that this campaign complies with applicable Meta
                policies and applicable law.
              </span>
            </label>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Back
              </Button>
              <Button
                disabled={
                  creating ||
                  !campaignName.trim() ||
                  previewData.missingVariableCount > 0 ||
                  previewData.eligibleCount === 0
                }
                onClick={() => {
                  const checkbox = document.getElementById("confirm-campaign") as HTMLInputElement;
                  if (!checkbox.checked) {
                    setError("Please confirm the consent statement before creating the campaign.");
                    return;
                  }
                  void handleCreate();
                }}
              >
                {creating ? "Creating…" : `Create campaign (${previewData.eligibleCount} recipients)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && createdCampaignId && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign created</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              The campaign was created as a draft. Open it to review and start sending.
            </p>
            <div>
              <Button onClick={() => router.push(`/campaigns/${createdCampaignId}`)}>
                View campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function toMetaTemplate(t: TemplateRow) {
  return { name: t.name, language: t.language, category: t.category, status: t.status, components: t.components };
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "template", label: "Template" },
    { key: "recipients", label: "Recipients" },
    { key: "mapping", label: "Mapping" },
    { key: "preview", label: "Preview" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex gap-2 text-xs">
      {steps.map((s, i) => (
        <div
          key={s.key}
          className={`rounded-full px-3 py-1 ${
            i === currentIndex
              ? "bg-primary text-primary-foreground"
              : i < currentIndex
                ? "bg-success text-success-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {i + 1}. {s.label}
        </div>
      ))}
    </div>
  );
}

function BindingRow({
  label,
  columns,
  binding,
  onChange,
}: {
  label: string;
  columns: string[];
  binding?: Binding;
  onChange: (binding: Binding) => void;
}) {
  const source = binding?.source ?? "column";
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[180px_140px_1fr]">
      <Label>{label}</Label>
      <Select
        value={source}
        onValueChange={(v) => onChange({ source: v as BindingSource, value: "" })}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="column">Spreadsheet column</SelectItem>
          <SelectItem value="contactField">Contact field</SelectItem>
          <SelectItem value="static">Static text</SelectItem>
        </SelectContent>
      </Select>
      {source === "column" && (
        <Select value={binding?.value} onValueChange={(v) => onChange({ source, value: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select column" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {source === "contactField" && (
        <Select value={binding?.value} onValueChange={(v) => onChange({ source, value: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_FIELD_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {source === "static" && (
        <Input
          value={binding?.value ?? ""}
          onChange={(e) => onChange({ source, value: e.target.value })}
          placeholder="Fixed text for every recipient"
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "success" | "destructive" | "warning";
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">
        {variant ? <Badge variant={variant}>{value}</Badge> : value}
      </p>
    </div>
  );
}
