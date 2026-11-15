// Regenerate with `node scripts/geni18n.mjs src/components/front/chat/i18n`.
// Builds src/components/front/chat/i18n/{en,es,pt,zh,hi}.ts from the mock's I18N and TX tables,
// re-keyed to the backend's question and option ids, plus the app's overrides (OV).
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("./i18n-mock-tables.js", import.meta.url), "utf8");
const { I18N, TX } = new Function(src + "\nreturn { I18N, TX };")();
const OUT = process.argv[2];

const raw = (code) => ({ __raw: code });
const fn = (f) => raw(f.toString());
function emit(v, ind = "  ") {
  if (v && v.__raw) return v.__raw;
  if (typeof v === "function") return v.toString();
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => emit(x, ind)).join(", ")}]`;
  const inner = ind + "  ";
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${/^[a-zA-Z_]\w*$/.test(k) ? k : JSON.stringify(k)}: ${emit(x, inner)},`).join("\n")}\n${ind}}`;
}

const prompt = (p) => {
  if (!Array.isArray(p)) return raw(`() => ${JSON.stringify(p)}`);
  if (typeof p[1] === "function") return raw(`({ name }) => (name ? (${p[1].toString()})(name) : ${JSON.stringify(p[0])})`);
  return raw(`({ size }) => (size === 1 ? ${JSON.stringify(p[0])} : ${JSON.stringify(p[1])})`);
};
const qc = (t) => ({ short: t[0], eye: t[1], prompt: prompt(t[2]), why: t[3] });

// Where the app differs from the mock (honest about what the backend does), per language.
const OV = {
  en: {
    q: { income_band: { short: "Yearly income", prompt: "Roughly how much comes in each year, for everyone at home?" } },
    income: { under: (a) => `Under ${a}`, range: (a, b) => `${a} to ${b}`, over: (a) => `More than ${a}` },
    ui: {
      bankLink: "Or connect a demo bank account",
      bankYes: (shown) => `Yes, ${shown}`,
      bankAsk: "Is that about right?",
      offTopic: "I'm here to help find food, heat, housing, health and other support nearby. Tell me what's going on, or tap what fits.",
      zipOut: "We only have local listings for Hampshire County so far. If you live, work or stay somewhere nearby, try that ZIP code.",
      craigs1: "Call {tel}. It will be at the top of your plan. If you're in danger, call {911}.",
      noneYet: "Nothing in our list matches yet. A few more answers may change that.",
      soFar: (n) => `${n} places so far`,
      failed: "That didn't go through. Could you try again?",
      expired: "Your last visit timed out, so we started fresh.",
      autoBar: (name) => `Playing an example for ${name}.`,
      takeover: "Answer for myself",
    },
    ack: {
      zipIn: (t, n) => (n > 0 ? `${t}. I know what's around there. I've already found ${n} ${n === 1 ? "place" : "places"} that might help.` : `${t}. I know what's around there.`),
      zipOut: "I don't have local listings there yet.",
      who60: "Some help is just for adults 60 and older. I'll look for those too.",
      whoChild: "Some food and early-learning programs are for young children and pregnancy. I'll look for those too.",
      other: "Thanks. I've noted that.",
    },
  },
  es: {
    q: { income_band: { short: "Ingreso anual", prompt: "Más o menos, ¿cuánto entra cada año para todos en casa?" } },
    income: { under: (a) => `Menos de ${a}`, range: (a, b) => `De ${a} a ${b}`, over: (a) => `Más de ${a}` },
    ui: {
      bankLink: "O conecte una cuenta bancaria de prueba",
      bankYes: (shown) => `Sí, ${shown}`,
      bankAsk: "¿Es más o menos correcto?",
      offTopic: "Estoy aquí para ayudarte a encontrar comida, calefacción, vivienda, salud y otro apoyo cerca de ti. Cuéntame qué pasa, o toca lo que aplique.",
      zipOut: "Por ahora solo tenemos listados locales para el condado de Hampshire. Si vives, trabajas o te quedas cerca, prueba con ese código postal.",
      craigs1: "Llama al {tel}. Estará al principio de tu plan. Si estás en peligro, llama al {911}.",
      noneYet: "Todavía nada en nuestra lista coincide. Algunas respuestas más podrían cambiar eso.",
      soFar: (n) => `${n} lugares hasta ahora`,
      failed: "No se pudo enviar. ¿Puedes intentarlo de nuevo?",
      expired: "Tu última visita expiró, así que empezamos de nuevo.",
      autoBar: (name) => `Reproduciendo un ejemplo para ${name}.`,
      takeover: "Responder por mi cuenta",
    },
    ack: {
      zipIn: (t, n) => (n > 0 ? `${t}. Conozco la zona. Ya encontré ${n} ${n === 1 ? "lugar que podría" : "lugares que podrían"} ayudar.` : `${t}. Conozco la zona.`),
      zipOut: "Todavía no tengo listados locales ahí.",
      who60: "Algunas ayudas son solo para personas de 60 años o más. También las buscaré.",
      whoChild: "Algunos programas de comida y educación temprana son para niños pequeños y embarazos. También los buscaré.",
      other: "Gracias. Lo anoté.",
    },
  },
  pt: {
    q: { income_band: { short: "Renda anual", prompt: "Mais ou menos, quanto entra por ano para todos em casa?" } },
    income: { under: (a) => `Menos de ${a}`, range: (a, b) => `De ${a} a ${b}`, over: (a) => `Mais de ${a}` },
    money: "pt-BR",
    ui: {
      bankLink: "Ou conecte uma conta bancária de demonstração",
      bankYes: (shown) => `Sim, ${shown}`,
      bankAsk: "Está mais ou menos certo?",
      offTopic: "Estou aqui para ajudar a encontrar comida, aquecimento, moradia, saúde e outros apoios perto de você. Conte o que está acontecendo, ou toque no que se aplica.",
      zipOut: "Por enquanto só temos listas locais do condado de Hampshire. Se você mora, trabalha ou fica perto daqui, tente esse ZIP code.",
      craigs1: "Ligue para {tel}. Ele vai aparecer no topo do seu plano. Se estiver em perigo, ligue para {911}.",
      noneYet: "Nada na nossa lista combina ainda. Mais algumas respostas podem mudar isso.",
      soFar: (n) => `${n} lugares até agora`,
      failed: "Não foi possível enviar. Pode tentar de novo?",
      expired: "Sua última visita expirou, então começamos de novo.",
      autoBar: (name) => `Mostrando um exemplo para ${name}.`,
      takeover: "Responder eu mesmo",
    },
    ack: {
      zipIn: (t, n) => (n > 0 ? `${t}. Conheço a região. Já encontrei ${n} ${n === 1 ? "lugar que pode" : "lugares que podem"} ajudar.` : `${t}. Conheço a região.`),
      zipOut: "Ainda não tenho listas locais aí.",
      who60: "Algumas ajudas são só para pessoas com 60 anos ou mais. Vou procurá-las também.",
      whoChild: "Alguns programas de comida e educação infantil são para crianças pequenas e gestantes. Vou procurá-los também.",
      other: "Obrigado. Anotei.",
    },
  },
  zh: {
    q: { income_band: { short: "年收入", prompt: "全家每年大约有多少收入？" } },
    income: { under: (a) => `少于 ${a}`, range: (a, b) => `${a} 到 ${b}`, over: (a) => `多于 ${a}` },
    ui: {
      bankLink: "或者连接一个演示银行账户",
      bankYes: (shown) => `是的，${shown}`,
      bankAsk: "这大致对吗？",
      offTopic: "我在这里帮你找附近的食物、取暖、住房、医疗等支持。告诉我你的情况，或点选符合的选项。",
      zipOut: "目前我们只有汉普郡（Hampshire County）的本地信息。如果你在附近居住、工作或暂住，可以试试那里的邮政编码。",
      craigs1: "请拨打 {tel}。它会排在你计划的最前面。如有危险，请拨打 {911}。",
      noneYet: "目前我们的列表里还没有匹配项。再回答几个问题可能会有变化。",
      soFar: (n) => `目前找到 ${n} 个地方`,
      failed: "没有发送成功。可以再试一次吗？",
      expired: "你上次的访问已过期，所以我们重新开始。",
      autoBar: (name) => `正在为 ${name} 演示一个例子。`,
      takeover: "我自己来回答",
    },
    ack: {
      zipIn: (t, n) => (n > 0 ? `${t}。我了解那一带。已经找到 ${n} 个可能帮到你的地方。` : `${t}。我了解那一带。`),
      zipOut: "那里我还没有本地信息。",
      who60: "有些帮助只面向60岁及以上的人，我也会帮你找。",
      whoChild: "有些食物和早教项目面向幼儿和孕妇，我也会帮你找。",
      other: "谢谢，我记下了。",
    },
  },
  hi: {
    q: { income_band: { short: "सालाना आय", prompt: "घर में सबको मिलाकर हर साल लगभग कितना पैसा आता है?" } },
    income: { under: (a) => `${a} से कम`, range: (a, b) => `${a} से ${b}`, over: (a) => `${a} से ज़्यादा` },
    ui: {
      bankLink: "या एक डेमो बैंक खाता जोड़ें",
      bankYes: (shown) => `हाँ, ${shown}`,
      bankAsk: "क्या यह लगभग सही है?",
      offTopic: "मैं आपके पास खाना, हीटिंग, रहने की जगह, इलाज और दूसरी मदद ढूँढने के लिए हूँ। बताइए क्या चल रहा है, या जो लागू हो उस पर टैप करें।",
      zipOut: "अभी हमारे पास सिर्फ़ हैम्पशायर काउंटी की स्थानीय जानकारी है। अगर आप पास में कहीं रहते, काम करते या ठहरते हैं, तो उस जगह का ZIP कोड आज़माएँ।",
      craigs1: "{tel} पर कॉल करें। यह आपकी योजना में सबसे ऊपर होगा। अगर आप ख़तरे में हैं, तो {911} पर कॉल करें।",
      noneYet: "अभी हमारी सूची में कुछ मेल नहीं खाता। कुछ और जवाबों से यह बदल सकता है।",
      soFar: (n) => `अब तक ${n} जगहें`,
      failed: "यह भेजा नहीं जा सका। क्या आप फिर से कोशिश करेंगे?",
      expired: "आपकी पिछली विज़िट का समय ख़त्म हो गया, इसलिए हमने फिर से शुरू किया।",
      autoBar: (name) => `${name} के लिए एक उदाहरण चल रहा है।`,
      takeover: "मैं ख़ुद जवाब दूँगा/दूँगी",
    },
    ack: {
      zipIn: (t, n) => (n > 0 ? `${t}। मैं उस इलाके को जानता हूँ। मुझे पहले ही ${n} ${n === 1 ? "जगह मिल गई है जो मदद कर सकती है" : "जगहें मिल गई हैं जो मदद कर सकती हैं"}।` : `${t}। मैं उस इलाके को जानता हूँ।`),
      zipOut: "वहाँ के लिए अभी मेरे पास स्थानीय जानकारी नहीं है।",
      who60: "कुछ मदद सिर्फ़ 60 साल और उससे ज़्यादा उम्र के लोगों के लिए है। मैं उन्हें भी ढूँढूँगा।",
      whoChild: "खाने और शुरुआती शिक्षा के कुछ कार्यक्रम छोटे बच्चों और गर्भावस्था के लिए हैं। मैं उन्हें भी ढूँढूँगा।",
      other: "धन्यवाद। मैंने नोट कर लिया।",
    },
  },
};

for (const lang of ["en", "es", "pt", "zh", "hi"]) {
  const T = TX[lang], H = I18N[lang], o = OV[lang];
  const opts = (t) => t[4];
  const dict = {
    hello: H,
    q: {
      name: { short: T.q.name[0] },
      needs: qc(T.q.needs),
      zip: qc(T.q.zip),
      household_size: qc(T.q.size),
      household_who: qc(T.q.who),
      utility_urgency: qc(T.q.shutoff),
      housing_status: qc(T.q.housing),
      income_band: { ...qc(T.q.income), short: o.q.income_band.short, prompt: raw(`() => ${JSON.stringify(o.q.income_band.prompt)}`) },
      review: qc(T.q.review),
    },
    options: {
      household_who: opts(T.q.who),
      utility_urgency: { shutoff: opts(T.q.shutoff).yes, behind: opts(T.q.shutoff).behind, reduce: opts(T.q.shutoff).no },
      housing_status: { renting: opts(T.q.housing).rent, own: opts(T.q.housing).own, staying_with_others: opts(T.q.housing).family, no_stable_housing: opts(T.q.housing).none },
    },
    income: {
      money: raw(`(n) => \`$\${n.toLocaleString(${JSON.stringify(o.money ?? "en-US")})}\``),
      under: fn(o.income.under), range: fn(o.income.range), over: fn(o.income.over),
    },
    needs: T.needs,
    fit: T.fit,
    ui: (() => {
      const u = { ...T.ui };
      delete u.outside;
      u.craigs = [u.craigs[0], o.ui.craigs1];
      for (const [k, v] of Object.entries(o.ui)) if (k !== "craigs1") u[k] = v;
      return u;
    })(),
    ack: { ...T.ack, ...o.ack },
  };
  const body = `// GENERATED from the design mock's ${lang} tables (scripts/geni18n.mjs), re-keyed to the\n// backend's ids, with the app's few honest rewordings. Native review pending.\nimport type { Dict } from "./types";\n\nexport const ${lang}: Dict = ${emit(dict, "")};\n`;
  writeFileSync(`${OUT}/${lang}.ts`, body);
}
console.log("ok");
