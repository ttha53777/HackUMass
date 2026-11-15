import type { Metadata } from "next";

import { Behind } from "@/components/front/behind/behind";

export const metadata: Metadata = {
  title: "Behind the scenes · OpenDoor",
  description: "How OpenDoor's coordinator and its helpers turn your answers into a plan.",
};

export default function BehindPage() {
  return <Behind />;
}
