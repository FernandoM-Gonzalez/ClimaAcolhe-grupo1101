(function () {
  "use strict";
  const { api } = window.ClimaAcolhe.api;
  const { CONFIG } = window.ClimaAcolhe.config;
  const { initWeather } = window.ClimaAcolhe.weather;

  function elemento(tag, texto, classe) {
    const el = document.createElement(tag);
    if (texto !== undefined) el.textContent = texto;
    if (classe) el.className = classe;
    return el;
  }
  function notificar(texto, erro = false) {
    const aviso = document.querySelector("#feedback");
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.className = erro ? "aviso feedback erro" : "aviso feedback sucesso";
    aviso.hidden = false;
    aviso.setAttribute("role", erro ? "alert" : "status");
    aviso.focus({ preventScroll: true });
    aviso.scrollIntoView({ block: "center" });
  }
  function prioridadeBadge(prioridade) {
    const classe = { Alta: "alta", "Média": "media", Baixa: "baixa" }[prioridade] || "";
    return elemento("span", prioridade || "Sem check-in", classe);
  }
  function formatarData(iso, incluirHora = false) {
    const data = new Date(typeof iso === "string" && iso.length === 10 ? `${iso}T12:00:00` : iso);
    return Number.isNaN(data.getTime()) ? "Data indisponível" : data.toLocaleString("pt-BR",
      incluirHora ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" });
  }
  async function montarPagina() {
    const pagina = document.body.dataset.page;
    let sessao = await api.getSession();
    const privada = pagina !== "login";
    if (privada && !sessao) {
      window.location.replace(`index.html?retorno=${pagina}.html`);
      return false;
    }
    document.querySelector("main").hidden = false;
    const nav = document.querySelector("nav");
    if (nav) {
      document.querySelector("#usuario").textContent = sessao.user.nome;
      document.querySelector("#sair").addEventListener("click", async function () {
        try { await api.logout(); }
        catch (erro) { if (await api.getSession()) { notificar(erro.message, true); return; } }
        window.location.assign("index.html");
      });
    }
    const avisoModo = document.querySelector("#mode-notice");
    if (avisoModo) avisoModo.textContent = CONFIG.apiMode === "demo"
      ? "Modo de teste: os dados são salvos neste navegador."
      : "Modo API: integração configurada para o servidor em C.";
    initWeather();
    if (privada) {
      const checar = async function () {
        sessao = await api.getSession();
        if (!sessao) window.location.replace(`index.html?retorno=${pagina}.html&expirada=1`);
      };
      window.setInterval(function () { checar().catch(erro => notificar(erro.message, true)); }, 30000);
      window.addEventListener("focus", function () { checar().catch(erro => notificar(erro.message, true)); });
    }
    return true;
  }
  window.ClimaAcolhe.ui = { elemento, notificar, prioridadeBadge, formatarData, montarPagina };
})();
