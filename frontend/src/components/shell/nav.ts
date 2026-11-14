import { HandHeart, House, Landmark, UserRound, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; sub: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/home", label: "Home", sub: "Your plan", icon: House },
  { href: "/benefits", label: "Government benefits", sub: "Apply with a guide", icon: Landmark },
  { href: "/local", label: "Local help", sub: "Call or visit", icon: HandHeart },
  { href: "/documents", label: "Documents", sub: "Your paper wallet", icon: Wallet },
  { href: "/about", label: "About you", sub: "Your answers", icon: UserRound },
];
