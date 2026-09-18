"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportValidationSummary } from "@/lib/contacts/validate";
import type { CommitImportResult } from "@/lib/contacts/importService";

type Step = "upload" | "map" | "confirm" | "done";

interface ParsedFile {
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  suggestedMapping: { name?: string; phone?: string; email?: string };
  defaultCountryCode: string;
}

interface Mapping {
  name?: string;
  phone?: string;
  email?: string;
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [summary, setSummary] = useState<ImportValidationSummary | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitImportResult | null>(null);

  async function handleFileSelected(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/contacts/import/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to parse file.");
      setParsed(data);
      setMapping(data.suggestedMapping ?? {});
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleValidate() {
    if (!parsed) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsed.rows,
          headers: parsed.headers,
          mapping,
          defaultCountry: parsed.defaultCountryCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Validation failed.");
      setSummary(data);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setValidating(false);
    }
  }

  async function handleCommit() {
    if (!parsed) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsed.rows,
          headers: parsed.headers,
          mapping,
          defaultCountry: parsed.defaultCountryCode,
          filename: parsed.filename,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Import failed.");
      setResult(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {step === "upload" && (
        <Card>
          <CardContent className="pt-6">
            <Label htmlFor="file" className="mb-2">
              CSV or XLSX file
            </Label>
            <input
              id="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {uploading ? <p className="mt-2 text-sm text-muted-foreground">Parsing file…</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Expected columns: a name column and a phone/mobile column at minimum. Other columns
              (grade, event, etc.) are preserved and can be used as template variables later.
            </p>
          </CardContent>
        </Card>
      )}

      {step === "map" && parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns — {parsed.filename} ({parsed.totalRows} rows)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <MappingSelect
                label="Name"
                headers={parsed.headers}
                value={mapping.name}
                onChange={(v) => setMapping((m) => ({ ...m, name: v }))}
                required
              />
              <MappingSelect
                label="Phone"
                headers={parsed.headers}
                value={mapping.phone}
                onChange={(v) => setMapping((m) => ({ ...m, phone: v }))}
                required
              />
              <MappingSelect
                label="Email (optional)"
                headers={parsed.headers}
                value={mapping.email}
                onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
              />
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                onClick={handleValidate}
                disabled={validating || !mapping.name || !mapping.phone}
              >
                {validating ? "Validating…" : "Validate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && summary && parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Review before import</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Total rows" value={summary.totalRows} />
              <Stat label="Valid" value={summary.validCount} variant="success" />
              <Stat label="Invalid" value={summary.invalidCount} variant="destructive" />
              <Stat label="Duplicates in file" value={summary.duplicateInFileCount} variant="warning" />
              <Stat label="Already in contacts" value={summary.existingInDatabaseCount} />
            </div>

            {summary.invalidCount > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Rows with errors</p>
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Row</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Phone</th>
                        <th className="px-3 py-2 font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.rows
                        .filter((r) => !r.valid)
                        .slice(0, 200)
                        .map((r) => (
                          <tr key={r.rowIndex}>
                            <td className="px-3 py-2">{r.rowIndex}</td>
                            <td className="px-3 py-2">{r.name || "—"}</td>
                            <td className="px-3 py-2">{r.phoneRaw || "—"}</td>
                            <td className="px-3 py-2 text-destructive">{r.errors.join(", ")}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" id="confirm-import" className="mt-0.5" required />
              <span>
                I confirm these {summary.validCount} valid contacts are authorised/consented
                recipients and that importing them complies with applicable policy.
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button
                onClick={() => {
                  const checkbox = document.getElementById("confirm-import") as HTMLInputElement;
                  if (!checkbox.checked) {
                    setError("Please confirm the consent statement before importing.");
                    return;
                  }
                  void handleCommit();
                }}
                disabled={committing || summary.validCount === 0}
              >
                {committing ? "Importing…" : `Import ${summary.validCount} contacts`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>{result.created} contacts created, {result.updated} updated.</p>
            <p className="text-muted-foreground">
              {result.skippedInvalid} skipped (invalid), {result.skippedDuplicateInFile} skipped
              (duplicate within file).
            </p>
            <div>
              <Button asChild>
                <Link href="/contacts">View contacts</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MappingSelect({
  label,
  headers,
  value,
  onChange,
  required,
}: {
  label: string;
  headers: string[];
  value?: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required ? " *" : ""}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
