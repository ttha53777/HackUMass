// GENERATED from the design mock's en tables (scripts/geni18n.mjs), re-keyed to the
// backend's ids, with the app's few honest rewordings. Native review pending.
import type { Dict } from "./types";

export const en: Dict = {
  hello: {
    hi: "hi!",
    eye: "Before we start",
    title: "What should I |call you?|",
    why: "Only so this feels a little less like a form.",
    ph: "Your first name",
    nick: "a nickname works too",
    meet: (n) => `Nice to meet you, ${n}.`,
    skip: "Skip",
    cont: "Continue",
    demo: "Demo",
  },
  q: {
    name: {
      short: "Your name",
    },
    needs: {
      short: "What's going on",
      eye: "What brings you here",
      prompt: ({ name }) =>
        name
          ? ((n) => `What's been weighing on you lately, ${n}?`)(name)
          : "What's been weighing on you lately?",
      why: "Pick what fits, even just one. You don't need to know which programs exist. That's our job.",
    },
    zip: {
      short: "Where",
      eye: "Where you are",
      prompt: () => "What's your ZIP code?",
      why: "Most help is run by towns and counties, so this tells us which offices actually serve you.",
    },
    household_size: {
      short: "Household",
      eye: "Who's at home",
      prompt: () => "How many people live with you, counting you?",
      why: "Count everyone you share food or bills with. Income limits are set by household size.",
    },
    household_who: {
      short: "Anyone who",
      eye: "Who's at home",
      prompt: ({ size }) =>
        size === 1
          ? "Do any of these describe you?"
          : "Does anyone at home fit any of these?",
      why: "Some programs are only for older adults, young children or pregnancy.",
    },
    utility_urgency: {
      short: "Heating",
      eye: "About the heat",
      prompt: () =>
        "Has a utility sent a shut-off notice, or is your fuel about to run out?",
      why: "From November 1 to April 30, heating emergencies can get faster help.",
    },
    housing_status: {
      short: "Housing",
      eye: "Where you're staying",
      prompt: () => "Where are you staying right now?",
      why: "Some help is only for renters, some only for homeowners.",
    },
    income_band: {
      short: "Yearly income",
      eye: "Money coming in",
      prompt: () =>
        "Roughly how much comes in each year, for everyone at home?",
      why: "Most programs set income limits. A rough range is fine, and you can skip this.",
    },
    review: {
      short: "Review",
      eye: "Almost there",
      prompt: () => "Here's what I heard.",
      why: "Tap anything to change it. Then we'll put your plan together.",
    },
  },
  options: {
    household_who: {
      "55": "55 to 59",
      "60": "60 or older",
      child: "A child under 5, or a pregnancy",
      none: "No one like that",
    },
    utility_urgency: {
      shutoff: "Yes, it's urgent",
      behind: "Not yet, but I'm behind on bills",
      reduce: "No, I just need help with the cost",
    },
    housing_status: {
      renting: "I rent",
      own: "I own my home",
      staying_with_others: "With friends or family for now",
      no_stable_housing: "I don't have a safe place tonight",
    },
  },
  income: {
    money: (n) => `$${n.toLocaleString("en-US")}`,
    under: (a) => `Under ${a}`,
    range: (a, b) => `${a} to ${b}`,
    over: (a) => `More than ${a}`,
  },
  needs: {
    food: ["Food", "Groceries, meals"],
    utilities: ["Heat & utilities", "Heating, electric, fuel"],
    housing: ["Rent & housing", "Rent, repairs, a place to stay"],
    healthcare: ["Medical care", "A clinic, coverage"],
    transportation: ["Getting around", "Buses, rides to appointments"],
    phone_internet: ["Phone & internet", "Service, a hotspot"],
    childcare: ["Childcare", "Early learning, Head Start"],
    mental_health: ["Someone to talk to", "Support, a crisis line"],
    legal: ["Legal help", "Questions, immigration"],
    employment: ["Work & training", "Finding a job"],
    taxes: ["Free tax help", "Filing for free"],
    safety: ["Safety at home", "Confidential support"],
  },
  fit: {
    likely: "Likely a fit",
    possibly: "Possibly a fit",
    info: "Need more info",
  },
  ui: {
    back: "Back",
    skip: "Skip",
    rather: "I'd rather not say",
    bankLink: "Or connect a demo bank account",
    bankYes: (shown) => `Yes, ${shown}`,
    bankAsk: "Is that about right?",
    cont: "Continue",
    plan: "Put my plan together",
    press: (L) => `Or press A to ${L}`,
    add: "Add",
    ownPh: "Something else? Tell me in your own words…",
    matchedFrom: (l) =>
      `From what you wrote, I've marked ${l}. Add anything else.`,
    marked: (l) =>
      `I've marked ${l} from what you wrote. I'll keep your words too.`,
    kept: "Thank you. I've kept your words. Tap anything above that's close, and I'll look for it.",
    safety: [
      "Your safety comes first.",
      "If you're in immediate danger, call {911}.",
      "For crisis support any time, call or text {988}.",
      "You can keep going here whenever it feels right. I can look for practical help too.",
    ],
    zipOut:
      "We only have local listings for Hampshire County so far. If you live, work or stay somewhere nearby, try that ZIP code.",
    rel: (x) => `People asking about ${x} often ask about these too:`,
    craigs: [
      "Craig's Doors offers emergency shelter, food and safety.",
      "Call {tel}. It will be at the top of your plan. If you're in danger, call {911}.",
    ],
    notAnswered: "Not answered",
    change: "Change",
    skipped: "Skipped",
    notSure: "Not sure yet",
    justMe: "Just me",
    people: (n) => `${n} people`,
    fewer: "One fewer",
    more: "One more",
    place1: "place that might help",
    placeN: "places that might help",
    noneYet:
      "Nothing in our list matches yet. A few more answers may change that.",
    and: "and",
    sep: ", ",
    startOver: "Start over",
    leave: "Leave quickly",
    found: "Found near you",
    note: "Labels are a first look. Only each program can say for sure who qualifies.",
    offTopic:
      "I'm here to help find food, heat, housing, health and other support nearby. Tell me what's going on, or tap what fits.",
    soFar: (n) => `${n} places so far`,
    failed: "That didn't go through. Could you try again?",
    expired: "Your last visit timed out, so we started fresh.",
    autoBar: (name) => `Playing an example for ${name}.`,
    takeover: "Answer for myself",
  },
  ack: {
    name0: "That's fine. Let's begin.",
    name: (n) => `Nice to meet you, ${n}. Let's take this one step at a time.`,
    needsMany: (l) =>
      `${l}. That's a lot to carry at once. We'll take it one piece at a time.`,
    needsFew: (l) =>
      `${l}. Thank you for telling me. Next, let's find what's near you.`,
    zipIn: (t, n) =>
      n > 0
        ? `${t}. I know what's around there. I've already found ${n} ${n === 1 ? "place" : "places"} that might help.`
        : `${t}. I know what's around there.`,
    zipOut: "I don't have local listings there yet.",
    size1: "Just you. Got it.",
    sizeN: (n) => `${n} of you. Got it.`,
    who60:
      "Some help is just for adults 60 and older. I'll look for those too.",
    whoChild:
      "Some food and early-learning programs are for young children and pregnancy. I'll look for those too.",
    whoNone: "Thanks. That's everything I need about your household.",
    shutYes: "Okay. I'll put the fastest heating help at the top of your plan.",
    shutBehind:
      "Thanks for telling me. Being behind is common, and there's help for it.",
    shutNo: "Got it. I'll look for help that lowers the cost.",
    houseNone:
      "Thank you for telling me. I'll put a place to stay tonight first.",
    houseOk: "Thanks. That narrows things down.",
    incSkip:
      "No problem. I'll mark income-based programs as needing more info.",
    incOk: "Thanks. That helps me read income limits.",
    other: "Thanks. I've noted that.",
  },
};
