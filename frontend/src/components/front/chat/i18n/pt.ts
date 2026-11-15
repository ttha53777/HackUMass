// GENERATED from the design mock's pt tables (scripts/geni18n.mjs), re-keyed to the
// backend's ids, with the app's few honest rewordings. Native review pending.
import type { Dict } from "./types";

export const pt: Dict = {
  hello: {
    hi: "olá!",
    eye: "Antes de começar",
    title: "Como devo |te chamar?|",
    why: "Só para isto parecer um pouco menos um formulário.",
    ph: "Seu primeiro nome",
    nick: "um apelido também serve",
    meet: (n) => `Prazer em conhecer, ${n}.`,
    skip: "Pular",
    cont: "Continuar",
    demo: "Demonstração",
  },
  q: {
    name: {
      short: "Seu nome",
    },
    needs: {
      short: "O que está acontecendo",
      eye: "O que traz você aqui",
      prompt: ({ name }) =>
        name
          ? ((n) => `O que tem pesado para você ultimamente, ${n}?`)(name)
          : "O que tem pesado para você ultimamente?",
      why: "Escolha o que se aplica, mesmo que seja só uma coisa. Você não precisa saber quais programas existem. Isso é com a gente.",
    },
    zip: {
      short: "Onde",
      eye: "Onde você está",
      prompt: () => "Qual é o seu ZIP code (CEP)?",
      why: "A maior parte da ajuda vem das cidades e condados, então isso nos diz quais escritórios atendem você.",
    },
    household_size: {
      short: "Casa",
      eye: "Quem mora com você",
      prompt: () => "Quantas pessoas moram com você, contando você?",
      why: "Conte todos com quem você divide comida ou contas. Os limites de renda dependem do tamanho da família.",
    },
    household_who: {
      short: "Alguém que",
      eye: "Quem mora com você",
      prompt: ({ size }) =>
        size === 1
          ? "Alguma destas descreve você?"
          : "Alguém em casa se encaixa em alguma destas?",
      why: "Alguns programas são só para idosos, crianças pequenas ou gestantes.",
    },
    utility_urgency: {
      short: "Aquecimento",
      eye: "Sobre o aquecimento",
      prompt: () =>
        "Você recebeu um aviso de corte, ou o seu combustível está quase acabando?",
      why: "De 1º de novembro a 30 de abril, emergências de aquecimento podem receber ajuda mais rápido.",
    },
    housing_status: {
      short: "Moradia",
      eye: "Onde você está morando",
      prompt: () => "Onde você está morando agora?",
      why: "Algumas ajudas são só para quem aluga, outras só para quem é dono.",
    },
    income_band: {
      short: "Renda anual",
      eye: "Dinheiro que entra",
      prompt: () => "Mais ou menos, quanto entra por ano para todos em casa?",
      why: "A maioria dos programas tem limites de renda. Uma faixa aproximada já serve, e você pode pular esta.",
    },
    review: {
      short: "Resumo",
      eye: "Quase lá",
      prompt: () => "Foi isto que eu entendi.",
      why: "Toque em qualquer item para mudar. Depois montamos o seu plano.",
    },
  },
  options: {
    household_who: {
      "55": "De 55 a 59",
      "60": "60 anos ou mais",
      child: "Uma criança com menos de 5 anos, ou uma gravidez",
      none: "Ninguém assim",
    },
    utility_urgency: {
      shutoff: "Sim, é urgente",
      behind: "Ainda não, mas estou atrasado nas contas",
      reduce: "Não, só preciso de ajuda com o custo",
    },
    housing_status: {
      renting: "Eu alugo",
      own: "Sou dono da minha casa",
      staying_with_others: "Com amigos ou família por enquanto",
      no_stable_housing: "Não tenho um lugar seguro esta noite",
    },
  },
  income: {
    money: (n) => `$${n.toLocaleString("pt-BR")}`,
    under: (a) => `Menos de ${a}`,
    range: (a, b) => `De ${a} a ${b}`,
    over: (a) => `Mais de ${a}`,
  },
  needs: {
    food: ["Comida", "Mantimentos, refeições"],
    utilities: ["Aquecimento e contas", "Aquecimento, luz, combustível"],
    housing: ["Aluguel e moradia", "Aluguel, reparos, um lugar para ficar"],
    healthcare: ["Atendimento médico", "Uma clínica, plano de saúde"],
    transportation: ["Transporte", "Ônibus, ida a consultas"],
    phone_internet: ["Telefone e internet", "Serviço, um hotspot"],
    childcare: ["Creche", "Educação infantil, Head Start"],
    mental_health: ["Alguém para conversar", "Apoio, uma linha de crise"],
    legal: ["Ajuda jurídica", "Dúvidas, imigração"],
    employment: ["Trabalho e cursos", "Encontrar emprego"],
    taxes: ["Ajuda grátis com impostos", "Declarar de graça"],
    safety: ["Segurança em casa", "Apoio confidencial"],
  },
  fit: {
    likely: "Provavelmente se aplica",
    possibly: "Talvez se aplique",
    info: "Precisa de mais informação",
  },
  ui: {
    back: "Voltar",
    skip: "Pular",
    rather: "Prefiro não dizer",
    bankLink: "Ou conecte uma conta bancária de demonstração",
    bankYes: (shown) => `Sim, ${shown}`,
    bankAsk: "Está mais ou menos certo?",
    cont: "Continuar",
    plan: "Montar meu plano",
    press: (L) => `Ou aperte de A a ${L}`,
    add: "Adicionar",
    ownPh: "Mais alguma coisa? Conte com suas palavras…",
    matchedFrom: (l) =>
      `Pelo que você escreveu, marquei ${l}. Adicione o que quiser.`,
    marked: (l) =>
      `Marquei ${l} pelo que você escreveu. Também guardei suas palavras.`,
    kept: "Obrigado. Guardei suas palavras. Toque acima no que for parecido e eu procuro.",
    safety: [
      "Sua segurança vem primeiro.",
      "Se você está em perigo imediato, ligue para {911}.",
      "Para apoio em crise a qualquer hora, ligue ou mande mensagem para {988}.",
      "Você pode continuar aqui quando se sentir pronto. Também posso procurar ajuda prática.",
    ],
    zipOut:
      "Por enquanto só temos listas locais do condado de Hampshire. Se você mora, trabalha ou fica perto daqui, tente esse ZIP code.",
    rel: (x) => `Quem pergunta sobre ${x} costuma perguntar também sobre:`,
    craigs: [
      "O Craig's Doors oferece abrigo de emergência, comida e segurança.",
      "Ligue para {tel}. Ele vai aparecer no topo do seu plano. Se estiver em perigo, ligue para {911}.",
    ],
    notAnswered: "Sem resposta",
    change: "Mudar",
    skipped: "Pulado",
    notSure: "Ainda não sei",
    justMe: "Só eu",
    people: (n) => `${n} pessoas`,
    fewer: "Uma a menos",
    more: "Uma a mais",
    place1: "lugar que pode ajudar",
    placeN: "lugares que podem ajudar",
    noneYet:
      "Nada na nossa lista combina ainda. Mais algumas respostas podem mudar isso.",
    and: "e",
    sep: ", ",
    startOver: "Recomeçar",
    leave: "Sair rápido",
    found: "Perto de você",
    note: "Os rótulos são uma primeira ideia. Só cada programa pode dizer com certeza quem se qualifica.",
    offTopic:
      "Estou aqui para ajudar a encontrar comida, aquecimento, moradia, saúde e outros apoios perto de você. Conte o que está acontecendo, ou toque no que se aplica.",
    soFar: (n) => `${n} lugares até agora`,
    failed: "Não foi possível enviar. Pode tentar de novo?",
    expired: "Sua última visita expirou, então começamos de novo.",
    autoBar: (name) => `Mostrando um exemplo para ${name}.`,
    takeover: "Responder eu mesmo",
  },
  ack: {
    name0: "Tudo bem. Vamos começar.",
    name: (n) => `Prazer, ${n}. Vamos um passo de cada vez.`,
    needsMany: (l) =>
      `${l}. É muita coisa para carregar de uma vez. Vamos por partes.`,
    needsFew: (l) =>
      `${l}. Obrigado por me contar. Agora vamos ver o que há perto de você.`,
    zipIn: (t, n) =>
      n > 0
        ? `${t}. Conheço a região. Já encontrei ${n} ${n === 1 ? "lugar que pode" : "lugares que podem"} ajudar.`
        : `${t}. Conheço a região.`,
    zipOut: "Ainda não tenho listas locais aí.",
    size1: "Só você. Entendi.",
    sizeN: (n) => `${n} pessoas. Entendi.`,
    who60:
      "Algumas ajudas são só para pessoas com 60 anos ou mais. Vou procurá-las também.",
    whoChild:
      "Alguns programas de comida e educação infantil são para crianças pequenas e gestantes. Vou procurá-los também.",
    whoNone: "Obrigado. É tudo o que preciso sobre a sua casa.",
    shutYes:
      "Certo. Vou colocar a ajuda de aquecimento mais rápida no topo do seu plano.",
    shutBehind:
      "Obrigado por me contar. Atrasar contas é comum, e há ajuda para isso.",
    shutNo: "Entendi. Vou procurar ajuda que diminua o custo.",
    houseNone:
      "Obrigado por me contar. Vou colocar primeiro um lugar para ficar esta noite.",
    houseOk: "Obrigado. Isso ajuda a filtrar.",
    incSkip:
      "Sem problema. Vou marcar os programas por renda como precisando de mais informação.",
    incOk: "Obrigado. Isso me ajuda com os limites de renda.",
    other: "Obrigado. Anotei.",
  },
};
