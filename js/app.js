(function () {
"use strict";
const { api } = window.ClimaAcolhe.api;
const { CONFIG, DEMO_CREDENTIALS } = window.ClimaAcolhe.config;
const { calcularIPTD } = window.ClimaAcolhe.iptd;
const { montarFila } = window.ClimaAcolhe.painel;
const { regras, validarFormulario, dataLocal } = window.ClimaAcolhe.validation;
const { montarPagina, elemento, notificar, prioridadeBadge, formatarData } = window.ClimaAcolhe.ui;
const $ = (seletor) => document.querySelector(seletor);
const destinos = [
  "inicio.html",
  "cadastro.html",
  "checkin.html",
  "painel.html",
  "intervencao.html",
];
const parametros = new URLSearchParams(window.location.search);

function tratarErro(erro, form) {
  if (erro.status === 401 && document.body.dataset.page !== "login") {
    window.location.replace(
      `index.html?expirada=1&retorno=${document.body.dataset.page}.html`,
    );
    return;
  }
  for (const [nome, mensagem] of Object.entries(erro.fields || {})) {
    const campoErro = form?.querySelector(`[data-error-for="${nome}"]`);
    if (campoErro) {
      campoErro.textContent = mensagem;
      form
        .querySelector(`[name="${nome}"]`)
        ?.setAttribute("aria-invalid", "true");
    }
  }
  notificar(
    erro.message || "Não foi possível concluir. Tente novamente.",
    true,
  );
}
async function executar(form, acao) {
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  form.setAttribute("aria-busy", "true");
  try {
    await acao();
  } catch (erro) {
    tratarErro(erro, form);
  } finally {
    botao.disabled = false;
    form.removeAttribute("aria-busy");
  }
}
function linkFeedback(texto, destino) {
  const a = elemento("a", texto, "feedback-link");
  a.href = destino;
  $("#feedback").append(document.createTextNode(" "), a);
}
function valor(form, nome) {
  return form.elements.namedItem(nome).value;
}

async function iniciarLogin() {
  const form = $("#login-form");
  const validacao = validarFormulario(form, {
    email: regras.email,
    senha: regras.senha,
  });
  $("#demo-email").textContent = DEMO_CREDENTIALS.email;
  $("#demo-password").textContent = DEMO_CREDENTIALS.senha;
  $(".demo-account").hidden = CONFIG.apiMode !== "demo";
  $("#fill-demo").addEventListener("click", () => {
    form.elements.email.value = DEMO_CREDENTIALS.email;
    form.elements.senha.value = DEMO_CREDENTIALS.senha;
    validacao.validate();
    form.querySelector("[type=submit]").focus();
  });
  $("#toggle-password").addEventListener("click", (event) => {
    const visivel = form.elements.senha.type === "password";
    form.elements.senha.type = visivel ? "text" : "password";
    event.target.textContent = visivel ? "Ocultar" : "Mostrar";
    event.target.setAttribute("aria-pressed", String(visivel));
  });
  if (parametros.has("expirada"))
    notificar("Sua sessão terminou. Entre novamente para continuar.", true);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validacao.validate()) {
      notificar("Confira o e-mail e a senha antes de entrar.", true);
      return;
    }
    executar(form, async () => {
      await api.login(valor(form, "email").trim(), valor(form, "senha"));
      const retorno = parametros.get("retorno");
      window.location.assign(
        destinos.includes(retorno) ? retorno : "inicio.html",
      );
    });
  });
}
async function iniciarMoradia() {
  const form = $("#moradia-form");
  let moradias = await api.listMoradias();
  const validacao = validarFormulario(form, {
    codigo: (value) =>
      regras.codigo(value) ||
      (moradias.some((item) => item.codigo === value.trim())
        ? "Este código já foi cadastrado. Use outro código."
        : ""),
    bairro: regras.bairro,
    referencia: regras.referencia,
    moradores: regras.moradores,
  });
  form.elements.codigo.addEventListener("input", () => {
    form.elements.codigo.value = form.elements.codigo.value.toUpperCase();
    validacao.field("codigo");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validacao.validate()) {
      notificar("Revise os campos indicados para salvar a moradia.", true);
      return;
    }
    executar(form, async () => {
      const data = {
        codigo: valor(form, "codigo").trim(),
        bairro: valor(form, "bairro").trim(),
        referencia: valor(form, "referencia").trim(),
        moradores: Number(valor(form, "moradores")),
      };
      const salva = await api.createMoradia(data);
      moradias.push(salva);
      notificar(
        `Moradia ${salva.codigo} cadastrada. Agora você pode preencher o check-in.`,
      );
      const destino = `checkin.html?codigo=${encodeURIComponent(salva.codigo)}`;
      linkFeedback("Fazer check-in →", destino);
      $("#moradia-next").hidden = false;
      $("#next-checkin").href = destino;
      form.reset();
    });
  });
}
async function preencherMoradias(form) {
  const moradias = await api.listMoradias();
  const select = form.elements.codigo;
  select.replaceChildren();
  const placeholder = elemento(
    "option",
    moradias.length ? "Selecione a moradia" : "Nenhuma moradia cadastrada",
  );
  placeholder.value = "";
  select.append(placeholder);
  for (const casa of [...moradias].sort((a, b) =>
    a.codigo.localeCompare(b.codigo),
  )) {
    const opcao = elemento("option", `${casa.codigo} · ${casa.bairro}`);
    opcao.value = casa.codigo;
    select.append(opcao);
  }
  const selecionada = parametros.get("codigo");
  if (moradias.some((item) => item.codigo === selecionada))
    select.value = selecionada;
  return moradias;
}
function respostasCheckin(form) {
  const respostas = { codigo: valor(form, "codigo") };
  for (const nome of ["calor", "sono", "agua"])
    respostas[nome] =
      valor(form, nome) === "" ? null : Number(valor(form, nome));
  for (const nome of ["ar", "sombra", "sensivel"])
    respostas[nome] =
      valor(form, nome) === "" ? null : valor(form, nome) === "1";
  return respostas;
}
function atualizarPrevia(form) {
  const r = respostasCheckin(form);
  const nomes = ["calor", "sono", "ar", "sombra", "agua", "sensivel"];
  const respondidos = nomes.filter((nome) => r[nome] !== null).length;
  // Dois itens da moradia são contados separadamente: 6 respostas para 5 critérios.
  const completo = respondidos === 6;
  const componentes = {
    calor: r.calor,
    sono: r.sono,
    moradia:
      r.ar === null || r.sombra === null
        ? null
        : Number(r.ar) + Number(r.sombra),
    agua: r.agua,
    pessoas: r.sensivel === null ? null : r.sensivel ? 2 : 0,
  };
  const parcial =
    (r.calor ?? 0) +
    (r.sono ?? 0) +
    Number(r.ar === true) +
    Number(r.sombra === true) +
    (r.agua ?? 0) +
    (r.sensivel === true ? 2 : 0);
  $("#score-value").textContent = respondidos ? parcial : "—";
  $("#score-progress").max = 6;
  $("#score-progress").value = respondidos;
  $("#score-completion").textContent = `${respondidos} de 6 itens respondidos`;
  for (const [nome, pontos] of Object.entries(componentes))
    $(`#points-${nome}`).textContent = `${pontos === null ? "—" : pontos} / 2`;
  if (completo) {
    const calculo = calcularIPTD(r);
    $("#score-priority").replaceChildren(prioridadeBadge(calculo.prioridade));
    $("#score-description").textContent =
      "Prévia completa. Salve o check-in para atualizar o painel.";
  } else {
    $("#score-priority").replaceChildren(
      elemento(
        "span",
        respondidos
          ? "Prévia parcial · sem classificação"
          : "Aguardando respostas",
        "badge neutra",
      ),
    );
    $("#score-description").textContent =
      "Responda os 6 itens para obter a classificação. Respostas vazias não valem zero.";
  }
  const resumo = $("#mobile-score");
  if (resumo) {
    resumo.replaceChildren(
      elemento(
        "span",
        completo ? "Prévia do IPTD" : `Prévia parcial · ${respondidos}/6`,
      ),
      elemento("strong", `${respondidos ? parcial : "—"}/10`),
    );
    resumo.append(
      completo
        ? prioridadeBadge(calcularIPTD(r).prioridade)
        : elemento("span", "Sem classificação", "badge neutra"),
    );
  }
}
async function iniciarCheckin() {
  const form = $("#checkin-form");
  const moradias = await preencherMoradias(form);
  $("#no-homes").hidden = Boolean(moradias.length);
  const validacao = validarFormulario(form, {
    codigo: (value) =>
      moradias.some((item) => item.codigo === value)
        ? ""
        : "Selecione uma moradia cadastrada.",
    calor: regras.escolha,
    sono: regras.escolha,
    ar: regras.binaria,
    sombra: regras.binaria,
    agua: regras.escolha,
    sensivel: regras.binaria,
  });
  form.addEventListener("change", () => atualizarPrevia(form));
  form.addEventListener("input", () => atualizarPrevia(form));
  atualizarPrevia(form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validacao.validate()) {
      notificar(
        "Selecione a moradia e responda todos os itens para salvar o check-in.",
        true,
      );
      return;
    }
    executar(form, async () => {
      const salvo = await api.createCheckin(respostasCheckin(form));
      notificar(
        `Check-in de ${salvo.codigo} salvo: ${salvo.total} pontos, prioridade ${salvo.prioridade.toLowerCase()}.`,
      );
      linkFeedback("Ver no painel →", "painel.html");
    });
  });
}

function detalheCaso(caso) {
  let area = $("#case-details");
  if (!area) {
    area = elemento("section", undefined, "caixa");
    area.id = "case-details";
    $(".dashboard-card").after(area);
  }
  area.replaceChildren();
  const titulo = elemento("h2", `${caso.codigo} · cálculo e histórico`);
  titulo.tabIndex = -1;
  area.append(titulo);
  area.append(
    elemento(
      "p",
      `Abertura: ${formatarData(caso.abertura, true)}. ${caso.historico.length} check-in(s).`,
      "muted",
    ),
  );
  if (!caso.historico.length)
    area.append(elemento("p", "Ainda não há respostas para calcular o IPTD."));
  for (const checkin of caso.historico) {
    const item = elemento("article", undefined, "history-item");
    item.append(
      elemento(
        "strong",
        `${formatarData(checkin.createdAt, true)} · ${checkin.total} pontos · ${checkin.prioridade}`,
      ),
    );
    const c = calcularIPTD(checkin).componentes;
    item.append(
      elemento(
        "p",
        `Calor ${c.calor} + Sono ${c.sono} + Moradia ${c.moradia} + Água ${c.agua} + Pessoas ${c.pessoas} = ${checkin.total}.`,
      ),
    );
    area.append(item);
  }
  area.hidden = false;
  titulo.focus();
}
async function iniciarPainel() {
  let fila = [];
  function renderizar() {
    const busca = $("#search").value.trim().toLocaleLowerCase("pt-BR");
    const prioridade = $("#filter-priority").value;
    const situacao = $("#filter-status").value;
    const filtrada = fila.filter(
      (item) =>
        (!busca ||
          `${item.codigo} ${item.bairro}`
            .toLocaleLowerCase("pt-BR")
            .includes(busca)) &&
        (!prioridade || item.prioridade === prioridade) &&
        (!situacao || item.situacao === situacao),
    );
    const tbody = $("#queue-body");
    tbody.replaceChildren();
    for (const caso of filtrada) {
      const tr = elemento("tr");
      const casa = elemento("td");
      casa.append(
        elemento("strong", caso.codigo),
        elemento("small", caso.bairro),
      );
      const pontos = elemento(
        "td",
        caso.total === null ? "—" : String(caso.total),
        "score-cell",
      );
      const prioridade = elemento("td");
      prioridade.append(prioridadeBadge(caso.prioridade));
      const status = elemento("td");
      const rotulo = elemento("span", caso.situacao, "status-label");
      rotulo.dataset.status = caso.situacao;
      status.append(rotulo);
      const data = elemento(
        "td",
        caso.checkin
          ? formatarData(caso.checkin.createdAt, true)
          : "Pendente de informação",
      );
      const acoes = elemento("td");
      const atender = elemento("a", "Registrar ação →", "table-action");
      atender.href = `intervencao.html?codigo=${encodeURIComponent(caso.codigo)}`;
      const checkin = elemento("a", "Novo check-in", "table-action");
      checkin.href = `checkin.html?codigo=${encodeURIComponent(caso.codigo)}`;
      const detalhes = elemento("button", "Cálculo e histórico", "text-button");
      detalhes.type = "button";
      detalhes.addEventListener("click", () => detalheCaso(caso));
      acoes.append(atender, checkin, detalhes);
      tr.append(casa, pontos, prioridade, status, data, acoes);
      tbody.append(tr);
    }
    $("#results-count").textContent =
      `${filtrada.length} de ${fila.length} moradia(s)`;
    $("#queue-empty").hidden = Boolean(filtrada.length);
    $("#queue-empty-text").textContent = fila.length
      ? "Nenhum caso corresponde aos filtros escolhidos."
      : "Cadastre a primeira moradia ou carregue os exemplos da apresentação.";
  }
  async function atualizar() {
    const [casas, checkins, acoes] = await Promise.all([
      api.listMoradias(),
      api.listCheckins(),
      api.listIntervencoes(),
    ]);
    fila = montarFila(casas, checkins, acoes);
    $("#stat-total").textContent = casas.length;
    $("#stat-high").textContent = fila.filter(
      (item) => item.prioridade === "Alta" && item.situacao !== "Concluído",
    ).length;
    $("#stat-progress").textContent = fila.filter(
      (item) => item.situacao === "Em atendimento",
    ).length;
    $("#stat-done").textContent = fila.filter(
      (item) => item.situacao === "Concluído",
    ).length;
    renderizar();
  }
  for (const seletor of ["#search", "#filter-priority", "#filter-status"])
    $(seletor).addEventListener("input", renderizar);
  $("#demo-tools").hidden = CONFIG.apiMode !== "demo";
  $("#load-examples").addEventListener("click", async (event) => {
    event.target.disabled = true;
    try {
      await api.loadDemoData();
      await atualizar();
      notificar(
        "Exemplos fictícios disponíveis. Códigos já cadastrados foram preservados.",
      );
    } catch (erro) {
      tratarErro(erro);
    } finally {
      event.target.disabled = false;
    }
  });
  await atualizar();
}
async function iniciarIntervencao() {
  const form = $("#intervencao-form");
  const moradias = await preencherMoradias(form);
  form.elements.data.value = dataLocal();
  form.elements.data.max = dataLocal();
  const validacao = validarFormulario(form, {
    codigo: (value) =>
      moradias.some((item) => item.codigo === value)
        ? ""
        : "Cadastre e selecione uma moradia.",
    data: regras.data,
    situacao: regras.situacao,
    acao: regras.acao,
  });
  let historico = await api.listIntervencoes();
  function renderizar() {
    const codigo = valor(form, "codigo");
    const lista = [...historico]
      .reverse()
      .filter((item) => item.codigo === codigo)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#history-count").textContent = `${lista.length} registro(s)`;
    $("#history-list").replaceChildren();
    if (!lista.length)
      $("#history-list").append(
        elemento(
          "p",
          codigo
            ? "Esta moradia ainda não tem intervenções registradas."
            : "Selecione uma moradia para ver o histórico.",
          "muted",
        ),
      );
    for (const acao of lista) {
      const artigo = elemento("article", undefined, "history-item");
      const cabecalho = elemento("div");
      cabecalho.append(
        elemento("strong", `${formatarData(acao.data)} · ${acao.codigo}`),
        elemento("span", acao.situacao, "badge neutra"),
      );
      artigo.append(
        cabecalho,
        elemento("p", acao.acao),
        elemento("small", `Registro em ${formatarData(acao.createdAt, true)}`),
      );
      $("#history-list").append(artigo);
    }
  }
  form.elements.codigo.addEventListener("change", renderizar);
  form.elements.acao.addEventListener("input", () => {
    $("#acao-count").textContent =
      `${valor(form, "acao").length} / 1.000 caracteres`;
  });
  renderizar();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validacao.validate()) {
      notificar(
        "Revise os campos indicados para registrar o atendimento.",
        true,
      );
      return;
    }
    executar(form, async () => {
      const registro = await api.createIntervencao({
        codigo: valor(form, "codigo"),
        data: valor(form, "data"),
        situacao: valor(form, "situacao"),
        acao: valor(form, "acao").trim(),
      });
      historico.push(registro);
      renderizar();
      notificar(
        `Intervenção de ${registro.codigo} registrada. Situação: ${registro.situacao}.`,
      );
      linkFeedback("Ver painel →", "painel.html");
      form.elements.acao.value = "";
      $("#acao-count").textContent = "0 / 1.000 caracteres";
    });
  });
}
async function iniciar() {
  if (!(await montarPagina())) return;
  const inicializadores = {
    login: iniciarLogin,
    cadastro: iniciarMoradia,
    checkin: iniciarCheckin,
    painel: iniciarPainel,
    intervencao: iniciarIntervencao,
  };
  await inicializadores[document.body.dataset.page]?.();
}
iniciar().catch((erro) => tratarErro(erro));

})();
