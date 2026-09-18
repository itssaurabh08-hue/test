import { prisma } from "@/lib/db/prisma";
import { PricingEditor } from "./pricing-editor";

export default async function PricingSettingsPage() {
  const rates = await prisma.pricingRate.findMany({ orderBy: [{ country: "asc" }, { category: "asc" }] });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Configure per-country, per-category rates used to calculate a campaign&rsquo;s{" "}
          <strong>estimated cost</strong>. This is an internal planning estimate, not Meta&rsquo;s
          actual invoice — verify current rates against Meta&rsquo;s published pricing before relying
          on it for budgeting.
        </p>
      </div>
      <PricingEditor
        initialRates={rates.map((r) => ({
          id: r.id,
          country: r.country,
          category: r.category,
          price: Number(r.price),
          currency: r.currency,
        }))}
      />
    </div>
  );
}
