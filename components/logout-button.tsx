"use client";

import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logout} className="mt-2">
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-0">
        Sign out
      </Button>
    </form>
  );
}
