import { requireAdmin } from "@/lib/auth/session";
import { AppFrame } from "@/components/app-frame";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return <AppFrame session={session}>{children}</AppFrame>;
}
