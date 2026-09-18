"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Suppression {
  id: string;
  phone: string;
  reason: string | null;
  source: string;
  createdAt: string;
  removedAt: string | null;
  createdBy: { name: string } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  INBOUND_KEYWORD: "Inbound keyword",
  MANUAL: "Manual",
  IMPORT: "Import",
};

export function SuppressionManager({ initialActiveCount }: { initialActiveCount: number }) {
  const [search, setSearch] = useState("");
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [activeCount, setActiveCount] = useState(initialActiveCount);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    setLoading(true);
    fetch(`/api/suppressions?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setSuppressions(data.suppressions ?? []);
        setActiveCount(data.activeCount ?? 0);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone, reason: newReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add suppression.");
      setNewPhone("");
      setNewReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add suppression.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(s: Suppression) {
    if (!confirm(`Remove ${s.phone} from the suppression list? They will become eligible for campaigns again.`))
      return;
    setBusyId(s.id);
    setError(null);
    const res = await fetch(`/api/suppressions/${s.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to remove suppression.");
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label>Phone number</Label>
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+919876543210"
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Reason (optional)</Label>
            <Input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="e.g. requested via email"
              className="w-64"
            />
          </div>
          <Button onClick={handleAdd} disabled={adding || !newPhone.trim()}>
            {adding ? "Adding…" : "Add to suppression list"}
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{activeCount} active suppressions</p>
        <Input
          placeholder="Search phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Added</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : suppressions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No suppression records.
                </td>
              </tr>
            ) : (
              suppressions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-medium">{s.phone}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {SOURCE_LABEL[s.source] ?? s.source}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.reason ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.removedAt ? (
                      <Badge variant="outline">Removed</Badge>
                    ) : (
                      <Badge variant="destructive">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!s.removedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === s.id}
                        onClick={() => handleRemove(s)}
                      >
                        Remove from list
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
