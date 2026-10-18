(function () {
"use strict";
const { CONFIG } = window.ClimaAcolhe.config;
const {
  AuthError,
  loginDemo,
  saveLogin,
  getAuthenticatedSession,
  requireSession,
  clearSession,
} = window.ClimaAcolhe.auth;
const { readDemoData, writeDemoData } = window.ClimaAcolhe.storage;
const { calcularIPTD } = window.ClimaAcolhe.iptd;

class ApiError extends Error {
  constructor(message, code = "API_ERROR", status = 0, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

function invalid(fields) {
  if (Object.keys(fields).length)
    throw new ApiError(
      "Revise os campos indicados.",
      "VALIDATION_ERROR",
      422,
      fields,
    );
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function codigo(value, fields) {
  const result = text(value).toUpperCase();
  if (!/^MOR-(?!0+$)\d{3,6}$/.test(result))
    fields.codigo =
      "Use MOR- e de 3 a 6 algarismos, com número maior que zero (ex.: MOR-001).";
  return result;
}

function moradiaInput(input = {}) {
  const fields = {};
  const result = {
    codigo: codigo(input.codigo, fields),
    bairro: text(input.bairro),
    referencia: text(input.referencia),
    moradores: input.moradores,
  };
  if (result.bairro.length < 2 || result.bairro.length > 80)
    fields.bairro = "Informe um bairro entre 2 e 80 caracteres.";
  if (
    (input.referencia != null && typeof input.referencia !== "string") ||
    result.referencia.length > 160
  )
    fields.referencia = "A referência deve ter até 160 caracteres.";
  if (
    !Number.isInteger(result.moradores) ||
    result.moradores < 1 ||
    result.moradores > 30
  )
    fields.moradores = "Informe de 1 a 30 moradores, sem casas decimais.";
  invalid(fields);
  return result;
}

function checkinInput(input = {}) {
  const fields = {};
  const result = { codigo: codigo(input.codigo, fields) };
  for (const field of ["calor", "sono", "agua"]) {
    result[field] = input[field];
    if (!Number.isInteger(input[field]) || input[field] < 0 || input[field] > 2)
      fields[field] = "Selecione uma das três respostas.";
  }
  for (const field of ["ar", "sombra", "sensivel"]) {
    result[field] = input[field];
    if (typeof input[field] !== "boolean")
      fields[field] =
        field === "sensivel"
          ? "Informe se há pessoa mais sensível ao calor."
          : "Informe a condição da moradia.";
  }
  invalid(fields);
  return result;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function intervencaoInput(input = {}) {
  const fields = {};
  const result = {
    codigo: codigo(input.codigo, fields),
    data: text(input.data),
    situacao: text(input.situacao),
    acao: text(input.acao),
  };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(result.data)
    ? new Date(`${result.data}T12:00:00Z`)
    : null;
  if (
    !date ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== result.data ||
    result.data > today()
  )
    fields.data = "Informe uma data válida, até hoje.";
  if (!["Pendente", "Em atendimento", "Concluído"].includes(result.situacao))
    fields.situacao = "Selecione uma situação válida.";
  if (result.acao.length < 10 || result.acao.length > 1000)
    fields.acao = "Descreva a ação com 10 a 1.000 caracteres.";
  invalid(fields);
  return result;
}

function assertMode() {
  if (!["demo", "api"].includes(CONFIG.apiMode))
    throw new ApiError(
      "Modo de integração inválido. Confira js/config.js.",
      "CONFIG_ERROR",
    );
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function ensureMoradia(data, code) {
  if (!data.moradias.some((item) => item.codigo === code)) {
    throw new ApiError(
      "Cadastre esta moradia antes de registrar o atendimento.",
      "MORADIA_NOT_FOUND",
      422,
      { codigo: "Esta moradia ainda não foi cadastrada." },
    );
  }
}

// Este é o único ponto de transporte. Não existe troca automática para demo.
async function request(
  path,
  { method = "GET", body, authenticated = true } = {},
) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authenticated)
    headers.Authorization = `Bearer ${(await requireSession()).accessToken}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
  try {
    const response = await fetch(
      `${CONFIG.apiBaseUrl.replace(/\/$/, "")}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      },
    );
    if (response.status === 401) {
      clearSession();
      throw new AuthError(
        authenticated
          ? "Sua sessão foi encerrada pelo servidor. Entre novamente."
          : "E-mail ou senha incorretos.",
        authenticated ? "AUTH_REQUIRED" : "INVALID_CREDENTIALS",
      );
    }
    let payload = null;
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new ApiError(
          "O servidor retornou uma resposta inválida.",
          "INVALID_RESPONSE",
          response.status,
        );
      }
    }
    if (!response.ok) {
      const fields = payload?.error?.fields;
      throw new ApiError(
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : "Não foi possível concluir a operação no servidor.",
        typeof payload?.error?.code === "string"
          ? payload.error.code
          : "SERVER_ERROR",
        response.status,
        fields && typeof fields === "object" && !Array.isArray(fields)
          ? fields
          : {},
      );
    }
    return payload;
  } catch (error) {
    if (
      error instanceof ApiError ||
      error instanceof AuthError ||
      error.code === "STORAGE_ERROR"
    )
      throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        "O servidor demorou para responder. Verifique a conexão e tente novamente.",
        "TIMEOUT",
      );
    throw new ApiError(
      "Não foi possível acessar a API. Verifique se o servidor em C está ligado e permite esta origem (CORS).",
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function listResponse(response, collection) {
  if (!response || !Array.isArray(response[collection]))
    throw new ApiError(
      "O servidor retornou uma lista inválida.",
      "INVALID_RESPONSE",
    );
  return response[collection];
}

function recordResponse(response, field) {
  if (
    !response?.[field] ||
    typeof response[field] !== "object" ||
    Array.isArray(response[field])
  )
    throw new ApiError(
      "O servidor retornou um registro inválido.",
      "INVALID_RESPONSE",
    );
  return response[field];
}

async function list(collection) {
  assertMode();
  await requireSession();
  if (CONFIG.apiMode === "api")
    return listResponse(await request(`/${collection}`), collection);
  return readDemoData()[collection];
}

const api = {
  async login(email, senha) {
    assertMode();
    const fields = {};
    const normalizedEmail = text(email).toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.length > 254
    )
      fields.email = "Informe um e-mail válido.";
    if (typeof senha !== "string" || senha.length < 6 || senha.length > 128)
      fields.senha = "Informe uma senha de 6 a 128 caracteres.";
    invalid(fields);
    if (CONFIG.apiMode === "demo") return loginDemo(normalizedEmail, senha);
    const response = await request("/auth/login", {
      method: "POST",
      body: { email: normalizedEmail, senha },
      authenticated: false,
    });
    await saveLogin(response, "api");
    return response;
  },

  async logout() {
    // O encerramento local ocorre mesmo quando a API está fora do ar.
    assertMode();
    try {
      if (CONFIG.apiMode === "api" && (await getAuthenticatedSession()))
        await request("/auth/logout", { method: "POST" });
    } finally {
      clearSession();
    }
  },

  async getSession() {
    assertMode();
    const session = await getAuthenticatedSession();
    return session
      ? { user: session.user, expiresAt: session.expiresAt }
      : null;
  },

  listMoradias: () => list("moradias"),
  listCheckins: () => list("checkins"),
  listIntervencoes: () => list("intervencoes"),

  async createMoradia(input) {
    assertMode();
    await requireSession();
    const clean = moradiaInput(input);
    if (CONFIG.apiMode === "api")
      return recordResponse(
        await request("/moradias", { method: "POST", body: clean }),
        "moradia",
      );
    const data = readDemoData();
    if (data.moradias.some((item) => item.codigo === clean.codigo))
      throw new ApiError(
        "Esta moradia já está cadastrada.",
        "DUPLICATE_MORADIA",
        409,
        { codigo: "Este código já pertence a uma moradia cadastrada." },
      );
    const moradia = {
      id: id("moradia"),
      ...clean,
      createdAt: new Date().toISOString(),
    };
    data.moradias.push(moradia);
    writeDemoData(data);
    return moradia;
  },

  async createCheckin(input) {
    assertMode();
    await requireSession();
    const clean = checkinInput(input);
    if (CONFIG.apiMode === "api")
      return recordResponse(
        await request("/checkins", { method: "POST", body: clean }),
        "checkin",
      );
    const data = readDemoData();
    ensureMoradia(data, clean.codigo);
    const score = calcularIPTD(clean);
    const checkin = {
      id: id("checkin"),
      ...clean,
      total: score.total,
      prioridade: score.prioridade,
      componentes: score.componentes,
      createdAt: new Date().toISOString(),
    };
    data.checkins.push(checkin);
    writeDemoData(data);
    return checkin;
  },

  async createIntervencao(input) {
    assertMode();
    await requireSession();
    const clean = intervencaoInput(input);
    if (CONFIG.apiMode === "api")
      return recordResponse(
        await request("/intervencoes", { method: "POST", body: clean }),
        "intervencao",
      );
    const data = readDemoData();
    ensureMoradia(data, clean.codigo);
    const intervencao = {
      id: id("intervencao"),
      ...clean,
      createdAt: new Date().toISOString(),
    };
    data.intervencoes.push(intervencao);
    writeDemoData(data);
    return intervencao;
  },

  async loadDemoData() {
    assertMode();
    await requireSession();
    if (CONFIG.apiMode !== "demo")
      throw new ApiError(
        "Exemplos só podem ser inseridos no modo demonstração.",
        "DEMO_ONLY",
      );
    const data = readDemoData();
    // Os totais/situações reproduzem o painel da entrega 2; bairros são fictícios.
    const seeds = [
      {
        codigo: "MOR-001",
        bairro: "Jardim Esperança",
        moradores: 4,
        calor: 1,
        sono: 1,
        ar: true,
        sombra: false,
        agua: 1,
        sensivel: true,
        situacao: "Em atendimento",
      },
      {
        codigo: "MOR-002",
        bairro: "Vila Nova",
        moradores: 2,
        calor: 1,
        sono: 0,
        ar: false,
        sombra: false,
        agua: 1,
        sensivel: false,
        situacao: "Concluído",
      },
      {
        codigo: "MOR-003",
        bairro: "Jardim Esperança",
        moradores: 5,
        calor: 2,
        sono: 1,
        ar: true,
        sombra: true,
        agua: 1,
        sensivel: true,
        situacao: "Pendente",
      },
      {
        codigo: "MOR-004",
        bairro: "Vila Nova",
        moradores: 3,
        calor: 1,
        sono: 1,
        ar: true,
        sombra: false,
        agua: 1,
        sensivel: false,
        situacao: "Pendente",
      },
    ];
    let inserted = 0;
    seeds.forEach((seed, index) => {
      // Um código já usado pertence ao conjunto existente, mesmo quando não há
      // check-in ou intervenção. Não acrescente exemplos ao histórico dessa casa.
      if (data.moradias.some((item) => item.codigo === seed.codigo)) return;
      const createdAt = new Date(
        Date.now() - (24 * 60 + 4 - index) * 60000,
      ).toISOString();
      data.moradias.push({
        id: `demo-moradia-${seed.codigo}`,
        codigo: seed.codigo,
        bairro: seed.bairro,
        referencia: "Exemplo fictício da entrega 3.",
        moradores: seed.moradores,
        createdAt,
      });
      inserted++;
      const checkinId = `demo-checkin-${seed.codigo}`;
      if (!data.checkins.some((item) => item.id === checkinId)) {
        const clean = checkinInput(seed);
        data.checkins.push({
          id: checkinId,
          ...clean,
          ...calcularIPTD(clean),
          createdAt,
        });
        inserted++;
      }
      const interventionId = `demo-intervencao-${seed.codigo}`;
      if (!data.intervencoes.some((item) => item.id === interventionId)) {
        data.intervencoes.push({
          id: interventionId,
          codigo: seed.codigo,
          data: today(),
          situacao: seed.situacao,
          acao: "Registro fictício para demonstrar o acompanhamento da associação.",
          createdAt,
        });
        inserted++;
      }
    });
    if (inserted) writeDemoData(data);
    return {
      inserted,
      moradias: data.moradias.length,
      checkins: data.checkins.length,
      intervencoes: data.intervencoes.length,
    };
  },
};

window.ClimaAcolhe.api = { api, ApiError };
})();
