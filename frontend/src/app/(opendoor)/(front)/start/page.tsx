import { Conversation } from "@/components/front/chat/conversation";

// Reads the search params at request time, so this route is not prerendered.
export const instant = false;

export const metadata = { title: "Let's start · OpenDoor" };

/**
 * The conversation. `?sample=1` plays the example straight away; `?need=food`
 * starts with a need picked (a landing page tile); `?say=…` starts with the
 * person's words read ("That's me" on a Four nights card).
 */
export default async function Start({ searchParams }: PageProps<"/start">) {
  const { sample, need, say } = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <Conversation autoSample={one(sample) === "1"} need={one(need)} say={one(say)} />;
}
