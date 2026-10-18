(function () {
"use strict";
window.ClimaAcolhe = window.ClimaAcolhe || {};

// O armazenamento da demonstração pertence apenas a este navegador/origem.
const STORAGE_KEYS = {
  data: "climaacolhe:data:v1",
  session: "climaacolhe:session:v1",
};

class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "StorageError";
    this.code = "STORAGE_ERROR";
  }
}

function storage(kind) {
  try {
    const instance = globalThis[kind];
    if (!instance) throw new Error("Armazenamento indisponível.");
    return instance;
  } catch (cause) {
    throw new StorageError(
      "O navegador bloqueou o armazenamento. Permita dados deste site para continuar.",
      cause,
    );
  }
}

function read(kind, key) {
  let raw;
  try {
    raw = storage(kind).getItem(key);
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(
      "Não foi possível ler os dados salvos neste navegador.",
      cause,
    );
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new StorageError(
      "Os dados locais estão corrompidos. Exporte o que puder e limpe os dados deste site no navegador.",
      cause,
    );
  }
}

function write(kind, key, value) {
  try {
    storage(kind).setItem(key, JSON.stringify(value));
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(
      "Não foi possível salvar. O armazenamento está bloqueado ou sem espaço; nenhum registro foi confirmado.",
      cause,
    );
  }
}

function readDemoData() {
  const data = read("localStorage", STORAGE_KEYS.data);
  if (data === null)
    return { version: 1, moradias: [], checkins: [], intervencoes: [] };
  if (
    data.version !== 1 ||
    !["moradias", "checkins", "intervencoes"].every(
      (key) =>
        Array.isArray(data[key]) &&
        data[key].every(
          (item) => item && typeof item === "object" && !Array.isArray(item),
        ),
    )
  ) {
    throw new StorageError(
      "O formato dos dados locais é incompatível. Preserve uma cópia antes de limpar os dados deste site.",
    );
  }
  return data;
}

function writeDemoData(data) {
  write("localStorage", STORAGE_KEYS.data, data);
}

function readStoredSession() {
  const session = read("sessionStorage", STORAGE_KEYS.session);
  if (
    session !== null &&
    (session.version !== 1 ||
      typeof session.accessToken !== "string" ||
      !session.user ||
      !["demo", "api"].includes(session.mode))
  ) {
    throw new StorageError(
      "A sessão salva tem um formato incompatível. Feche esta aba e entre novamente.",
    );
  }
  return session;
}

function writeStoredSession(session) {
  write("sessionStorage", STORAGE_KEYS.session, { version: 1, ...session });
}

function clearStoredSession() {
  try {
    storage("sessionStorage").removeItem(STORAGE_KEYS.session);
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(
      "Não foi possível encerrar a sessão neste navegador. Feche esta aba para remover a sessão.",
      cause,
    );
  }
}

window.ClimaAcolhe.storage = {
  STORAGE_KEYS,
  StorageError,
  readDemoData,
  writeDemoData,
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
};
})();
