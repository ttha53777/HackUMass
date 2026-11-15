"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { FrontTheme } from "@/components/front/front-theme";
import { AgentFlowPill } from "@/components/loop/agent-flow-mini";
import { useApp } from "@/components/session/session-provider";
import { clearDevice } from "@/lib/device-state";

import { HubDefs } from "./hub-defs";

import "./hub.css";

function Mark() {
  return (
    <Link className="mark" href="/home" aria-label="OpenDoor, your plan">
      <svg viewBox="0 0 22 28" aria-hidden="true">
        <path d="M2 27 V2.5 C8 1.6 14 1.6 20 2.4 V27" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M5 27 V5 L15 7 V25.5 Z" fill="var(--door)" />
        <circle cx="12.6" cy="16.5" r="1.1" fill="var(--brass)" />
      </svg>
      OpenDoor
    </Link>
  );
}

const TABS = [
  { href: "/home", label: "Your plan" },
  { href: "/papers", label: "Papers" },
];

/**
 * The Plan Hub's frame: the floating pill nav, the page, and the footer with the
 * promises, crisis lines and Leave quickly. Light only (FrontTheme pins the page to paper).
 * `fonts` carries the next/font variable classes from the server layout.
 */
export function HubShell({ fonts, children }: { fonts: string; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { restart } = useApp();

  // Same as the conversation's Leave quickly: the link opens the weather in a new tab,
  // and this page clears what is on the device and goes back to the start.
  const leave = () => {
    clearDevice();
    void restart();
    router.replace("/");
  };

  return (
    <div className={`od-hub ${fonts}`}>
      <FrontTheme />
      <HubDefs />
      <div className="shell">
        <div className="nav">
          <Mark />
          <nav aria-label="Sections">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="navact" />
        </div>
      </div>
      <main id="top">
        <div className="wrap">
          {children}
          <footer className="end">
            <p className="promises">
              <b>We never press Send for you.</b> A maybe stays a maybe. No account, no Social Security number.
            </p>
            <p>
              In danger now? Call <b>911</b>. Crisis support: call or text <b>988</b>.
            </p>
            <a
              className="leave"
              href="https://www.weather.gov"
              target="_blank"
              rel="noopener noreferrer"
              title="Opens the weather and clears this page"
              onClick={leave}
            >
              Leave quickly
            </a>
          </footer>
        </div>
      </main>
      <AgentFlowPill />
    </div>
  );
}
