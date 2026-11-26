// はじめて開いたときの案内（サーバーで文言を読み、端末側のシートに渡す）

import { getDataStore } from "@/lib/data";
import { getGuides, type GuideKey } from "@/lib/guides";
import { FirstGuideSheet } from "@/components/first-guide-sheet";

export async function FirstGuide({ guideKey }: { guideKey: GuideKey }) {
  const guides = await getGuides(getDataStore()).catch(() => null);
  if (!guides) return null;
  return <FirstGuideSheet guideKey={guideKey} cards={guides[guideKey]} helpHref="/staff/guide/shift" />;
}
