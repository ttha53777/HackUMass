import type { Fit } from "../model";

/** What a question's wording may depend on. */
export type Ctx = { name: string; size: number | null };

export type QCopy = {
  /** The trail and review label. */
  short: string;
  eye: string;
  prompt: (ctx: Ctx) => string;
  why: string;
};

type QAsked =
  | "needs"
  | "zip"
  | "household_size"
  | "household_who"
  | "utility_urgency"
  | "housing_status"
  | "income_band"
  | "review";

/**
 * Everything the conversation says, in one language. Keyed by the backend's
 * question and option ids. The landing page, Building and the dashboard stay English.
 */
export type Dict = {
  /** The name screen. */
  hello: {
    hi: string;
    eye: string;
    title: string;
    why: string;
    ph: string;
    nick: string;
    meet: (n: string) => string;
    skip: string;
    cont: string;
    demo: string;
  };
  q: Record<QAsked, QCopy> & { name: { short: string } };
  /** Fixed option labels, by option id. */
  options: {
    household_who: Record<"60" | "55" | "child" | "none", string>;
    utility_urgency: Record<"shutoff" | "behind" | "reduce", string>;
    housing_status: Record<
      "renting" | "own" | "staying_with_others" | "no_stable_housing",
      string
    >;
  };
  /** Yearly income ranges, rebuilt from the backend's option ids ("0-24000"). */
  income: {
    money: (n: number) => string;
    under: (a: string) => string;
    range: (a: string, b: string) => string;
    over: (a: string) => string;
  };
  /** Need id -> [label, hint]. */
  needs: Record<string, [string, string]>;
  fit: Record<Fit, string>;
  ui: {
    back: string;
    skip: string;
    rather: string;
    /** Under the income question: opens the demo bank sandbox. */
    bankLink: string;
    /** One-tap confirm of what the demo bank suggests; `shown` comes from the server (English). */
    bankYes: (shown: string) => string;
    /** After the bank's own reason (English, from the server). */
    bankAsk: string;
    cont: string;
    plan: string;
    press: (letter: string) => string;
    add: string;
    ownPh: string;
    matchedFrom: (l: string) => string;
    marked: (l: string) => string;
    kept: string;
    offTopic: string;
    safety: [string, string, string, string];
    zipOut: string;
    rel: (x: string) => string;
    craigs: [string, string];
    notAnswered: string;
    change: string;
    skipped: string;
    notSure: string;
    justMe: string;
    people: (n: number) => string;
    fewer: string;
    more: string;
    place1: string;
    placeN: string;
    soFar: (n: number) => string;
    noneYet: string;
    and: string;
    sep: string;
    startOver: string;
    leave: string;
    found: string;
    note: string;
    failed: string;
    expired: string;
    autoBar: (name: string) => string;
    takeover: string;
  };
  ack: {
    name0: string;
    name: (n: string) => string;
    needsMany: (l: string) => string;
    needsFew: (l: string) => string;
    zipIn: (town: string, n: number) => string;
    zipOut: string;
    size1: string;
    sizeN: (n: number) => string;
    who60: string;
    whoChild: string;
    whoNone: string;
    shutYes: string;
    shutBehind: string;
    shutNo: string;
    houseNone: string;
    houseOk: string;
    incSkip: string;
    incOk: string;
    other: string;
  };
};
