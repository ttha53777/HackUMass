import { PlanHub } from "@/components/hub/plan-hub";

// Waits for the session in the browser (see the layout).
export const instant = false;

export const metadata = { title: "Your plan · OpenDoor" };

export default function HomePage() {
  return <PlanHub />;
}
