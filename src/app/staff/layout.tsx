import { requireSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { DemoBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-dvh flex flex-col">
      <DemoBanner show={isDemoMode()} />
      <AppHeader session={session} homeHref="/staff" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5 pb-12 animate-fade-up">{children}</main>
    </div>
  );
}
