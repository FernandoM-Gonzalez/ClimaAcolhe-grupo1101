(function () {
"use strict";
window.ClimaAcolhe = window.ClimaAcolhe || {};

// Troque apiMode para 'api' quando o servidor em C estiver disponível.
const CONFIG = {
  apiMode: "demo",
  apiBaseUrl: "http://localhost:8080/api/v1",
  requestTimeoutMs: 10000,
  // O futuro servidor em C acessará o MySQL. O navegador conversa só com a API.
  // Credenciais do banco deverão existir apenas no servidor, nunca neste arquivo.
  databaseEngine: "mysql",
};

// Credenciais fictícias para apresentar a entrega 3. Não usar em produção.
const DEMO_CREDENTIALS = {
  email: "coordenador@climaacolhe.org",
  senha: "Clima123!",
};

window.ClimaAcolhe.config = { CONFIG, DEMO_CREDENTIALS };
})();
