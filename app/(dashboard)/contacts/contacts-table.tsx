"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  optedOut: boolean;
  source: string;
  createdAt: string;
}

const FILTERS = [
  { key: "any", label: "All" },
  { key: "false", label: "Active" },
  { key: "true", label: "Opted out" },
] as const;

export function ContactsTable({ initialTotal, initialOptedOut }: { initialTotal: number; initialOptedOut: number }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("any");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: initialTotal, optedOut: initialOptedOut });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter !== "any") params.set("optedOut", filter);
    setLoading(true);
    fetch(`/api/contacts?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setContacts(data.contacts ?? []);
        setCounts({ total: data.total ?? 0, optedOut: data.optedOutCount ?? 0 });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter]);

  async function handleDelete(contact: Contact) {
    if (!confirm(`Delete ${contact.name} (${contact.phone})? This cannot be undone.`)) return;
    setBusyId(contact.id);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to delete contact.");
      return;
    }
    load();
  }

  async function handleOptOut(contact: Contact) {
    if (!confirm(`Mark ${contact.name} as opted out? They will be excluded from future campaigns.`)) return;
    setBusyId(contact.id);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}/opt-out`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Failed to opt out contact.");
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {counts.total} total · {counts.optedOut} opted out
        </p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search name/phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/api/contacts/export">Export CSV</Link>
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No contacts match.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="hover:bg-accent/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.phone}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.source}</td>
                  <td className="px-4 py-2.5">
                    {c.optedOut ? (
                      <Badge variant="destructive">Opted out</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      {!c.optedOut && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === c.id}
                          onClick={() => handleOptOut(c)}
                        >
                          Mark opted out
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => handleDelete(c)}
                      >
                        Delete
                      </Button>
                    </div>
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
