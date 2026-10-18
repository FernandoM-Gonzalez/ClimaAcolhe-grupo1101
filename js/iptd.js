(function () {
"use strict";
window.ClimaAcolhe = window.ClimaAcolhe || {};

// Critérios da ideação e da 2ª entrega. O clima externo não entra na soma.
function classificarIPTD(total) {
  if (!Number.isInteger(total) || total < 0 || total > 10)
    throw new Error("IPTD deve estar entre 0 e 10.");
  return total >= 7 ? "Alta" : total >= 4 ? "Média" : "Baixa";
}

function calcularIPTD(respostas) {
  for (const campo of ["calor", "sono", "agua"]) {
    if (
      !Number.isInteger(respostas[campo]) ||
      respostas[campo] < 0 ||
      respostas[campo] > 2
    ) {
      throw new Error(
        "Responda todos os critérios antes de classificar a prioridade.",
      );
    }
  }
  for (const campo of ["ar", "sombra", "sensivel"]) {
    if (typeof respostas[campo] !== "boolean")
      throw new Error("Informe todas as condições da moradia.");
  }
  const componentes = {
    calor: respostas.calor,
    sono: respostas.sono,
    moradia: Number(respostas.ar) + Number(respostas.sombra),
    agua: respostas.agua,
    pessoas: respostas.sensivel ? 2 : 0,
  };
  const total = Object.values(componentes).reduce(
    (soma, valor) => soma + valor,
    0,
  );
  return { total, prioridade: classificarIPTD(total), componentes };
}

window.ClimaAcolhe.iptd = { calcularIPTD, classificarIPTD };
})();
