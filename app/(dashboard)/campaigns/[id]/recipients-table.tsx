"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Recipient {
  id: string;
  name: string;
  phone: string;
  status: string;
  metaMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

const FILTERS = ["ALL", "PENDING", "QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  PENDING: "outline",
  QUEUED: "secondary",
  SENT: "default",
  DELIVERED: "success",
  READ: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export function RecipientsTable({ campaignId }: { campaignId: string }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    if (search) params.set("search", search);
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`/api/campaigns/${campaignId}/recipients?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setRecipients(data.recipients ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [campaignId, filter, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search name/phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Meta Message ID</th>
              <th className="px-3 py-2 font-medium">Error</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Delivered</th>
              <th className="px-3 py-2 font-medium">Read</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : recipients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No recipients match.
                </td>
              </tr>
            ) : (
              recipients.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.phone}</td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {r.metaMessageId ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-destructive">{r.errorMessage ?? ""}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.deliveredAt ? new Date(r.deliveredAt).toLocaleTimeString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.readAt ? new Date(r.readAt).toLocaleTimeString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Button asChild variant="link" size="sm" className="self-start px-0">
        <Link href="/campaigns">← Back to campaigns</Link>
      </Button>
    </div>
  );
}
