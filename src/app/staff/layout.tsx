import { requireSession } from "@/lib/auth/session";
import { AppFrame } from "@/components/app-frame";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return <AppFrame session={session}>{children}</AppFrame>;
}
