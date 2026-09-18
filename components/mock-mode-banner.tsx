import { isMockMode } from "@/lib/env";

export function MockModeBanner() {
  if (!isMockMode()) return null;
  return (
    <div className="w-full bg-warning px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-warning-foreground">
      DEVELOPMENT / MOCK MODE — no real WhatsApp messages are being sent
    </div>
  );
}
