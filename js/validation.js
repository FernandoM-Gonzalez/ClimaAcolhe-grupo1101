(function () {
  "use strict";
const CODIGO_PATTERN = /^MOR-(?!0+$)\d{3,6}$/;
function dataLocal() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}
const regras = {
  codigo: (value) =>
    CODIGO_PATTERN.test(value.trim())
      ? ""
      : "Use MOR- e de 3 a 6 números. Ex.: MOR-001.",
  bairro: (value) =>
    value.trim().length >= 2 && value.trim().length <= 80
      ? ""
      : "Informe um bairro entre 2 e 80 caracteres.",
  referencia: (value) =>
    value.trim().length <= 160 ? "" : "Use até 160 caracteres.",
  moradores: (value) =>
    /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 30
      ? ""
      : "Informe um número inteiro de 1 a 30 moradores.",
  email: (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length <= 254
      ? ""
      : "Informe um e-mail válido.",
  senha: (value) =>
    value.length >= 6 && value.length <= 128
      ? ""
      : "Informe uma senha de 6 a 128 caracteres.",
  data: (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value &&
    value <= dataLocal()
      ? ""
      : "Informe uma data válida, até hoje.",
  acao: (value) =>
    value.trim().length >= 10 && value.trim().length <= 1000
      ? ""
      : "Descreva o atendimento com 10 a 1.000 caracteres.",
  situacao: (value) =>
    ["Pendente", "Em atendimento", "Concluído"].includes(value)
      ? ""
      : "Escolha a situação do atendimento.",
  escolha: (value) =>
    ["0", "1", "2"].includes(value) ? "" : "Selecione uma resposta.",
  binaria: (value) =>
    ["0", "1"].includes(value) ? "" : "Escolha uma das opções.",
};

// Aulas 12 e 13: localizar elementos e reagir aos eventos de digitação/mudança.
function validarFormulario(form, validadores) {
  function validarCampo(nome) {
    const campo = form.elements.namedItem(nome);
    const mensagem = validadores[nome](campo?.value ?? "");
    const aviso = form.querySelector(`[data-error-for="${nome}"]`);
    if (aviso) aviso.textContent = mensagem;
    for (const controle of form.querySelectorAll(`[name="${nome}"]`)) {
      controle.setAttribute("aria-invalid", String(Boolean(mensagem)));
    }
    return !mensagem;
  }
  for (const evento of ["input", "change", "focusout"]) {
    form.addEventListener(evento, (event) => {
      if (Object.hasOwn(validadores, event.target.name))
        validarCampo(event.target.name);
    });
  }
  return {
    validate() {
      const resultados = Object.keys(validadores).map(validarCampo);
      const valido = resultados.every(Boolean);
      if (!valido) form.querySelector('[aria-invalid="true"]')?.focus();
      return valido;
    },
    field: validarCampo,
  };
}

window.ClimaAcolhe.validation = { CODIGO_PATTERN, dataLocal, regras, validarFormulario };
})();
