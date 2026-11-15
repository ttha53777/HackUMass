"use client";

import Link from "next/link";

import { vars } from "../css-vars";
import { Mark } from "../mark";
import { START_LABEL, useEntry } from "./use-entry";

/**
 * Top bar: draws itself in on load, then condenses into a frosted pill once you
 * scroll (the "scrolled" class, toggled by the page's motion hook via `id`).
 * On Behind the scenes the section links lead back to the landing page.
 */
export function LandingNav({ id = "lshell", behind = false }: { id?: string; behind?: boolean }) {
  const entry = useEntry();
  const base = behind ? "/" : "";
  return (
    <header className="l-shell" id={id}>
      <div className="wrap l-nav">
        <Mark />
        <nav aria-label="Page">
          <a href={`${base}#street`} style={vars({ "--i": 0 })}>
            Stories
          </a>
          <a href={`${base}#how`} style={vars({ "--i": 1 })}>
            How it works
          </a>
          <a href={`${base}#promises`} style={vars({ "--i": 2 })}>
            Our promises
          </a>
          <Link href="/behind" style={vars({ "--i": 3 })} aria-current={behind ? "page" : undefined}>
            Behind the scenes
          </Link>
          <button className="btn" style={vars({ "--i": 4 })} onClick={(e) => entry.start(e.currentTarget)}>
            {START_LABEL.nav[entry.state]}
            <svg aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>
        </nav>
      </div>
    </header>
  );
}
