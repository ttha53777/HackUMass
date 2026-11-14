import { GuideRoute } from "@/components/benefits/guide-route";

// Waits for the session in the browser (see the layout).
export const instant = false;

export default function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  return <GuideRoute params={params} />;
}
