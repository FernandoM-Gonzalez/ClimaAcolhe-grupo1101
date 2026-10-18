(function () {
"use strict";
const { CONFIG, DEMO_CREDENTIALS } = window.ClimaAcolhe.config;
const {
  readStoredSession,
  writeStoredSession,
  clearStoredSession,
} = window.ClimaAcolhe.storage;

// É uma chave simétrica PUBLICADA para a atividade, e qualquer pessoa pode usá-la.
// A assinatura demonstra o formato JWT, mas não protege dados reais no frontend.
const DEMO_SIGNING_KEY =
  "ClimaAcolhe-chave-publica-somente-demonstracao-entrega3";
const JWT_ISSUER = "climaacolhe";
const JWT_AUDIENCE = "climaacolhe-web";
const DEMO_USER = {
  id: "coordenador-demo",
  nome: "Coordenação de teste",
  email: DEMO_CREDENTIALS.email,
};
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
let keyPromise;

class AuthError extends Error {
  constructor(
    message = "Sua sessão expirou. Entre novamente.",
    code = "AUTH_REQUIRED",
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = 401;
  }
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new AuthError();
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (base64url(bytes) !== part) throw new AuthError();
  return bytes;
}

function parseToken(token) {
  if (typeof token !== "string" || token.length > 10000) throw new AuthError();
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError();
  const header = JSON.parse(decoder.decode(decodePart(parts[0])));
  const claims = JSON.parse(decoder.decode(decodePart(parts[1])));
  const signature = decodePart(parts[2]);
  if (
    !header ||
    header.typ !== "JWT" ||
    !claims ||
    !Number.isInteger(claims.exp) ||
    typeof claims.sub !== "string" ||
    !claims.sub
  )
    throw new AuthError();
  return { parts, header, claims, signature };
}

async function signingKey() {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "O login exige Web Crypto. Abra index.html em uma versão atual do Chrome, Edge ou Firefox.",
    );
  }
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(DEMO_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}

function validateClaims(claims, user) {
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.exp <= now ||
    claims.sub !== user.id ||
    claims.iss !== JWT_ISSUER ||
    claims.aud !== JWT_AUDIENCE ||
    !Number.isInteger(claims.iat) ||
    claims.iat > now + 60
  )
    throw new AuthError();
}

function validateUser(user) {
  if (
    !user ||
    typeof user.id !== "string" ||
    !user.id ||
    typeof user.nome !== "string" ||
    !user.nome ||
    typeof user.email !== "string" ||
    !user.email
  ) {
    throw new AuthError("O servidor retornou um usuário inválido.");
  }
}

async function loginDemo(email, senha) {
  if (email !== DEMO_CREDENTIALS.email || senha !== DEMO_CREDENTIALS.senha) {
    throw new AuthError("E-mail ou senha incorretos.", "INVALID_CREDENTIALS");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        sub: DEMO_USER.id,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await signingKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${payload}`),
  );
  const response = {
    accessToken: `${header}.${payload}.${base64url(new Uint8Array(signature))}`,
    expiresIn: 3600,
    user: { ...DEMO_USER },
  };
  await saveLogin(response, "demo");
  return response;
}

async function saveLogin(response, mode = CONFIG.apiMode) {
  try {
    validateUser(response?.user);
    if (!Number.isInteger(response.expiresIn) || response.expiresIn <= 0)
      throw new AuthError();
    const { claims } = parseToken(response.accessToken);
    validateClaims(claims, response.user);
    writeStoredSession({
      mode,
      accessToken: response.accessToken,
      user: response.user,
      expiresAt: claims.exp * 1000,
    });
  } catch (error) {
    if (error.code === "STORAGE_ERROR") throw error;
    throw new AuthError(
      "O servidor retornou uma sessão inválida. Tente novamente.",
      "INVALID_SESSION",
    );
  }
}

async function getAuthenticatedSession() {
  const session = readStoredSession();
  if (!session) return null;
  let parsed;
  try {
    validateUser(session.user);
    parsed = parseToken(session.accessToken);
    validateClaims(parsed.claims, session.user);
    if (
      session.mode !== CONFIG.apiMode ||
      session.expiresAt !== parsed.claims.exp * 1000
    )
      throw new AuthError();
  } catch {
    clearStoredSession();
    return null;
  }
  if (session.mode === "demo") {
    const key = await signingKey();
    const valid =
      parsed.header.alg === "HS256" &&
      (await crypto.subtle.verify(
        "HMAC",
        key,
        parsed.signature,
        encoder.encode(parsed.parts.slice(0, 2).join(".")),
      ));
    if (!valid) {
      clearStoredSession();
      return null;
    }
  }
  // Em modo API, ler claims só permite atualizar a interface. O servidor em C
  // deve autenticar cada requisição verificando a assinatura com sua chave secreta.
  return session;
}

async function requireSession() {
  const session = await getAuthenticatedSession();
  if (!session) throw new AuthError();
  return session;
}

window.ClimaAcolhe.auth = {
  DEMO_SIGNING_KEY,
  JWT_ISSUER,
  JWT_AUDIENCE,
  AuthError,
  loginDemo,
  saveLogin,
  getAuthenticatedSession,
  requireSession,
  clearSession: clearStoredSession,
};
})();
