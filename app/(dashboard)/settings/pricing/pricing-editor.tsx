"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Rate {
  id: string;
  country: string;
  category: string;
  price: number;
  currency: string;
}

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION", "SERVICE"];

export function PricingEditor({ initialRates }: { initialRates: Rate[] }) {
  const router = useRouter();
  const [rates, setRates] = useState(initialRates);
  const [country, setCountry] = useState("IN");
  const [category, setCategory] = useState("MARKETING");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, category, price: Number(price), currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save rate.");
      setRates((prev) => {
        const others = prev.filter((r) => !(r.country === country && r.category === category));
        return [...others, data.rate as Rate].sort((a, b) => a.country.localeCompare(b.country));
      });
      setPrice("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label>Country</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Price per message</Label>
            <Input type="number" step="0.0001" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSave} disabled={saving || !price} className="w-full">
              {saving ? "Saving…" : "Save rate"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Country</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium">Currency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rates.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5">{r.country}</td>
                <td className="px-4 py-2.5">{r.category}</td>
                <td className="px-4 py-2.5">{r.price.toFixed(4)}</td>
                <td className="px-4 py-2.5">{r.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
