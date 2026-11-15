import { PapersView } from "@/components/hub/papers-view";

// Waits for the session in the browser (see the layout).
export const instant = false;

export const metadata = { title: "Papers · OpenDoor" };

export default function PapersPage() {
  return <PapersView />;
}
