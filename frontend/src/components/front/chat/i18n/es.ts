// GENERATED from the design mock's es tables (scripts/geni18n.mjs), re-keyed to the
// backend's ids, with the app's few honest rewordings. Native review pending.
import type { Dict } from "./types";

export const es: Dict = {
  hello: {
    hi: "¡hola!",
    eye: "Antes de empezar",
    title: "¿Cómo te |llamo?|",
    why: "Solo para que esto se sienta menos como un formulario.",
    ph: "Tu nombre",
    nick: "un apodo también sirve",
    meet: (n) => `Mucho gusto, ${n}.`,
    skip: "Omitir",
    cont: "Continuar",
    demo: "Demostración",
  },
  q: {
    name: {
      short: "Tu nombre",
    },
    needs: {
      short: "Qué pasa",
      eye: "Qué te trae aquí",
      prompt: ({ name }) =>
        name
          ? ((n) => `¿Qué te ha estado preocupando últimamente, ${n}?`)(name)
          : "¿Qué te ha estado preocupando últimamente?",
      why: "Elige lo que aplique, aunque sea solo una cosa. No necesitas saber qué programas existen. Ese es nuestro trabajo.",
    },
    zip: {
      short: "Dónde",
      eye: "Dónde estás",
      prompt: () => "¿Cuál es tu código postal?",
      why: "La mayoría de la ayuda la dan los pueblos y condados, así sabemos qué oficinas te atienden.",
    },
    household_size: {
      short: "Hogar",
      eye: "Quién vive contigo",
      prompt: () => "¿Cuántas personas viven contigo, contándote a ti?",
      why: "Cuenta a todos con quienes compartes comida o gastos. Los límites de ingresos dependen del tamaño del hogar.",
    },
    household_who: {
      short: "Alguien que",
      eye: "Quién vive contigo",
      prompt: ({ size }) =>
        size === 1
          ? "¿Alguna de estas te describe?"
          : "¿Alguien en casa encaja con alguna de estas?",
      why: "Algunos programas son solo para personas mayores, niños pequeños o embarazos.",
    },
    utility_urgency: {
      short: "Calefacción",
      eye: "Sobre la calefacción",
      prompt: () =>
        "¿Te llegó un aviso de corte de servicio, o se te está acabando el combustible?",
      why: "Del 1 de noviembre al 30 de abril, las emergencias de calefacción pueden recibir ayuda más rápido.",
    },
    housing_status: {
      short: "Vivienda",
      eye: "Dónde te quedas",
      prompt: () => "¿Dónde te estás quedando ahora?",
      why: "Algunas ayudas son solo para inquilinos, otras solo para dueños de casa.",
    },
    income_band: {
      short: "Ingreso anual",
      eye: "Dinero que entra",
      prompt: () => "Más o menos, ¿cuánto entra cada año para todos en casa?",
      why: "La mayoría de los programas tienen límites de ingresos. Un rango aproximado está bien, y puedes omitir esto.",
    },
    review: {
      short: "Resumen",
      eye: "Ya casi",
      prompt: () => "Esto es lo que entendí.",
      why: "Toca cualquier cosa para cambiarla. Luego armamos tu plan.",
    },
  },
  options: {
    household_who: {
      "55": "De 55 a 59",
      "60": "60 años o más",
      child: "Un niño menor de 5 años, o un embarazo",
      none: "Nadie así",
    },
    utility_urgency: {
      shutoff: "Sí, es urgente",
      behind: "Todavía no, pero estoy atrasado con las facturas",
      reduce: "No, solo necesito ayuda con el costo",
    },
    housing_status: {
      renting: "Alquilo",
      own: "Soy dueño de mi casa",
      staying_with_others: "Con amigos o familia por ahora",
      no_stable_housing: "No tengo un lugar seguro esta noche",
    },
  },
  income: {
    money: (n) => `$${n.toLocaleString("en-US")}`,
    under: (a) => `Menos de ${a}`,
    range: (a, b) => `De ${a} a ${b}`,
    over: (a) => `Más de ${a}`,
  },
  needs: {
    food: ["Comida", "Víveres, comidas"],
    utilities: ["Calefacción y servicios", "Calefacción, luz, combustible"],
    housing: [
      "Renta y vivienda",
      "Renta, reparaciones, un lugar donde quedarse",
    ],
    healthcare: ["Atención médica", "Una clínica, seguro médico"],
    transportation: ["Transporte", "Autobuses, viajes a citas"],
    phone_internet: ["Teléfono e internet", "Servicio, un hotspot"],
    childcare: ["Cuidado infantil", "Educación temprana, Head Start"],
    mental_health: ["Alguien con quien hablar", "Apoyo, una línea de crisis"],
    legal: ["Ayuda legal", "Preguntas, inmigración"],
    employment: ["Trabajo y capacitación", "Encontrar empleo"],
    taxes: ["Ayuda gratis con impuestos", "Declarar gratis"],
    safety: ["Seguridad en casa", "Apoyo confidencial"],
  },
  fit: {
    likely: "Probablemente aplica",
    possibly: "Quizás aplica",
    info: "Falta información",
  },
  ui: {
    back: "Atrás",
    skip: "Omitir",
    rather: "Prefiero no decirlo",
    bankLink: "O conecte una cuenta bancaria de prueba",
    bankYes: (shown) => `Sí, ${shown}`,
    bankAsk: "¿Es más o menos correcto?",
    cont: "Continuar",
    plan: "Armar mi plan",
    press: (L) => `O presiona de la A a la ${L}`,
    add: "Agregar",
    ownPh: "¿Algo más? Cuéntame con tus propias palabras…",
    matchedFrom: (l) =>
      `Por lo que escribiste, marqué ${l}. Agrega lo que quieras.`,
    marked: (l) =>
      `Marqué ${l} por lo que escribiste. También guardo tus palabras.`,
    kept: "Gracias. Guardé tus palabras. Toca arriba lo que se parezca y lo buscaré.",
    safety: [
      "Tu seguridad es lo primero.",
      "Si estás en peligro inmediato, llama al {911}.",
      "Para apoyo en crisis a cualquier hora, llama o envía un mensaje al {988}.",
      "Puedes seguir aquí cuando te sientas listo. También puedo buscar ayuda práctica.",
    ],
    zipOut:
      "Por ahora solo tenemos listados locales para el condado de Hampshire. Si vives, trabajas o te quedas cerca, prueba con ese código postal.",
    rel: (x) => `Quienes preguntan por ${x} suelen preguntar también por:`,
    craigs: [
      "Craig's Doors ofrece refugio de emergencia, comida y seguridad.",
      "Llama al {tel}. Estará al principio de tu plan. Si estás en peligro, llama al {911}.",
    ],
    notAnswered: "Sin responder",
    change: "Cambiar",
    skipped: "Omitido",
    notSure: "Aún no sé",
    justMe: "Solo yo",
    people: (n) => `${n} personas`,
    fewer: "Una menos",
    more: "Una más",
    place1: "lugar que podría ayudar",
    placeN: "lugares que podrían ayudar",
    noneYet:
      "Todavía nada en nuestra lista coincide. Algunas respuestas más podrían cambiar eso.",
    and: "y",
    sep: ", ",
    startOver: "Empezar de nuevo",
    leave: "Salir rápido",
    found: "Cerca de ti",
    note: "Las etiquetas son una primera idea. Solo cada programa puede decir con certeza quién califica.",
    offTopic:
      "Estoy aquí para ayudarte a encontrar comida, calefacción, vivienda, salud y otro apoyo cerca de ti. Cuéntame qué pasa, o toca lo que aplique.",
    soFar: (n) => `${n} lugares hasta ahora`,
    failed: "No se pudo enviar. ¿Puedes intentarlo de nuevo?",
    expired: "Tu última visita expiró, así que empezamos de nuevo.",
    autoBar: (name) => `Reproduciendo un ejemplo para ${name}.`,
    takeover: "Responder por mi cuenta",
  },
  ack: {
    name0: "Está bien. Empecemos.",
    name: (n) => `Mucho gusto, ${n}. Vamos paso a paso.`,
    needsMany: (l) =>
      `${l}. Es mucho que cargar a la vez. Lo veremos poco a poco.`,
    needsFew: (l) =>
      `${l}. Gracias por contármelo. Ahora veamos qué hay cerca de ti.`,
    zipIn: (t, n) =>
      n > 0
        ? `${t}. Conozco la zona. Ya encontré ${n} ${n === 1 ? "lugar que podría" : "lugares que podrían"} ayudar.`
        : `${t}. Conozco la zona.`,
    zipOut: "Todavía no tengo listados locales ahí.",
    size1: "Solo tú. Entendido.",
    sizeN: (n) => `Son ${n}. Entendido.`,
    who60:
      "Algunas ayudas son solo para personas de 60 años o más. También las buscaré.",
    whoChild:
      "Algunos programas de comida y educación temprana son para niños pequeños y embarazos. También los buscaré.",
    whoNone: "Gracias. Es todo lo que necesito sobre tu hogar.",
    shutYes:
      "De acuerdo. Pondré la ayuda de calefacción más rápida al principio de tu plan.",
    shutBehind:
      "Gracias por decírmelo. Atrasarse es común, y hay ayuda para eso.",
    shutNo: "Entendido. Buscaré ayuda que baje el costo.",
    houseNone:
      "Gracias por decírmelo. Pondré primero un lugar donde quedarte esta noche.",
    houseOk: "Gracias. Eso reduce las opciones.",
    incSkip:
      "No hay problema. Marcaré los programas por ingresos como que falta información.",
    incOk: "Gracias. Eso me ayuda con los límites de ingresos.",
    other: "Gracias. Lo anoté.",
  },
};
