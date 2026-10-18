(function () {
"use strict";
window.ClimaAcolhe = window.ClimaAcolhe || {};

function recentes(registros) {
  // reverse preserva a última inclusão quando dois registros têm o mesmo instante.
  return [...registros]
    .reverse()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function montarFila(moradias, checkins, intervencoes) {
  const ultimosCheckins = recentes(checkins);
  const ultimasAcoes = recentes(intervencoes);
  return moradias
    .map((moradia) => {
      const historico = ultimosCheckins.filter(
        (item) => item.codigo === moradia.codigo,
      );
      const checkin = historico[0];
      return {
        ...moradia,
        checkin,
        historico,
        total: checkin?.total ?? null,
        prioridade: checkin?.prioridade ?? "Sem check-in",
        situacao:
          ultimasAcoes.find((item) => item.codigo === moradia.codigo)
            ?.situacao || "Pendente",
        abertura: historico.at(-1)?.createdAt || moradia.createdAt,
      };
    })
    .sort((a, b) => {
      const finalizados =
        Number(a.situacao === "Concluído") - Number(b.situacao === "Concluído");
      if (finalizados) return finalizados;
      const pontuacao = (b.total ?? -1) - (a.total ?? -1);
      if (pontuacao) return pontuacao;
      return (
        new Date(a.abertura) - new Date(b.abertura) ||
        a.codigo.localeCompare(b.codigo)
      );
    });
}

window.ClimaAcolhe.painel = { montarFila };
})();
