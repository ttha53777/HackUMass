"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Extras } from "./extras";
import { FinalCta, LandingFooter } from "./final-cta";
import { FourNights } from "./four-nights";
import { Hero } from "./hero";
import { Impact } from "./impact";
import { LandingNav } from "./nav";
import { NeedsTiles } from "./needs-tiles";
import { PROGRAM_COUNT } from "./program-count";
import { Promises } from "./promises";
import { Story } from "./story";
import { useLandingMotion } from "./use-landing-motion";

/** The landing page, 1:1 with the "OpenDoor Onboarding" design mock. */
export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useLandingMotion(root, PROGRAM_COUNT);
  // The design mock linked to Behind the scenes as /#behind; that page now lives at /behind.
  useEffect(() => {
    if (window.location.hash === "#behind") router.replace("/behind");
  }, [router]);
  return (
    <div className="view" id="v-land" ref={root}>
      <LandingNav />
      <Hero />
      <FourNights />
      <Story />
      <Impact />
      <Extras />
      <NeedsTiles />
      <Promises />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
