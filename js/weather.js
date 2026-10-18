(function () {
  "use strict";
/*
 * Clima informativo: Open-Meteo (uso acadêmico, sem chave).
 * Referências e decisões: ../docs/API-CLIMA.md.
 * Este módulo não participa do cálculo do IPTD.
 */

const CITIES = [
  {
    id: "campinas",
    name: "Campinas-SP",
    latitude: -22.9056,
    longitude: -47.0608,
  },
  {
    id: "sao-paulo",
    name: "São Paulo-SP",
    latitude: -23.5505,
    longitude: -46.6333,
  },
  {
    id: "rio",
    name: "Rio de Janeiro-RJ",
    latitude: -22.9068,
    longitude: -43.1729,
  },
  {
    id: "bh",
    name: "Belo Horizonte-MG",
    latitude: -19.9167,
    longitude: -43.9345,
  },
  { id: "recife", name: "Recife-PE", latitude: -8.0476, longitude: -34.877 },
  {
    id: "porto-alegre",
    name: "Porto Alegre-RS",
    latitude: -30.0346,
    longitude: -51.2177,
  },
];
const PREFERENCE_KEY = "climaacolhe.weather.preference.v1";
const CACHE_KEY = "climaacolhe.weather.cache.v1";
const CACHE_DURATION = 15 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;
const controllers = new WeakMap();

// Tradução autoral dos códigos WMO documentados pela Open-Meteo.
const CONDITIONS = {
  0: ["Céu limpo", "☀"],
  1: ["Predominantemente limpo", "☀"],
  2: ["Parcialmente nublado", "⛅"],
  3: ["Nublado", "☁"],
  45: ["Nevoeiro", "≋"],
  48: ["Nevoeiro com geada", "≋"],
  51: ["Garoa leve", "☂"],
  53: ["Garoa moderada", "☂"],
  55: ["Garoa intensa", "☂"],
  56: ["Garoa congelante leve", "☂"],
  57: ["Garoa congelante intensa", "☂"],
  61: ["Chuva leve", "☂"],
  63: ["Chuva moderada", "☂"],
  65: ["Chuva intensa", "☂"],
  66: ["Chuva congelante leve", "☂"],
  67: ["Chuva congelante intensa", "☂"],
  71: ["Neve leve", "❄"],
  73: ["Neve moderada", "❄"],
  75: ["Neve intensa", "❄"],
  77: ["Grãos de neve", "❄"],
  80: ["Pancadas leves", "☂"],
  81: ["Pancadas moderadas", "☂"],
  82: ["Pancadas intensas", "☂"],
  85: ["Pancadas de neve leves", "❄"],
  86: ["Pancadas de neve intensas", "❄"],
  95: ["Trovoadas", "ϟ"],
  96: ["Trovoadas com granizo leve", "ϟ"],
  99: ["Trovoadas com granizo intenso", "ϟ"],
};

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    // O widget também funciona com armazenamento bloqueado ou JSON antigo.
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Falta de espaço ou bloqueio não impede a consulta.
  }
}

function validCoordinates(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function readPreference() {
  const preference = readStorage(PREFERENCE_KEY, null);
  const city = CITIES.find((item) => item.id === preference?.id);
  if (city) return { ...city };
  if (
    preference?.id === "geolocation" &&
    validCoordinates(preference.latitude, preference.longitude)
  ) {
    return {
      id: "geolocation",
      name: "Minha localização",
      latitude: preference.latitude,
      longitude: preference.longitude,
    };
  }
  return { ...CITIES[0] };
}

function locationKey(location) {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
}

function validReading(reading) {
  if (
    !reading ||
    typeof reading.temperature !== "number" ||
    !Number.isFinite(reading.temperature) ||
    reading.temperature < -100 ||
    reading.temperature > 70 ||
    !Number.isInteger(reading.code) ||
    !Object.hasOwn(CONDITIONS, reading.code) ||
    typeof reading.time !== "string"
  )
    return false;

  // A hora ISO devolvida pela API já pertence ao fuso da coordenada consultada.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
    reading.time,
  );
  if (!parts) return false;
  const [, year, month, day, hour, minute] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

function readCache(location) {
  const cache = readStorage(CACHE_KEY, {});
  const record =
    cache && typeof cache === "object" ? cache[locationKey(location)] : null;
  const age = Date.now() - record?.fetchedAt;
  return record &&
    Number.isFinite(record.fetchedAt) &&
    age >= 0 &&
    age < CACHE_DURATION &&
    validReading(record.reading)
    ? record
    : null;
}

function saveCache(location, reading) {
  const stored = readStorage(CACHE_KEY, {});
  const cache = {};
  // Remove entradas expiradas para limitar o armazenamento.
  if (stored && typeof stored === "object") {
    Object.entries(stored).forEach(([key, record]) => {
      const age = Date.now() - record?.fetchedAt;
      if (age >= 0 && age < CACHE_DURATION && validReading(record?.reading))
        cache[key] = record;
    });
  }
  const record = { city: location.name, fetchedAt: Date.now(), reading };
  cache[locationKey(location)] = record;
  writeStorage(CACHE_KEY, cache);
  return record;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Inicializa o widget, caso #weather-widget exista. Pode ser chamado novamente. */
function initWeather() {
  const container = document.querySelector("#weather-widget");
  if (!container) return null;
  if (controllers.has(container)) return controllers.get(container);

  let location = readPreference();
  let requestNumber = 0;
  let activeRequest = null;
  let refreshTimer = null;
  let locationNumber = 0;
  let destroyed = false;

  container.classList.add("weather-widget");
  container.setAttribute("aria-label", "Clima informativo");
  const status = element("div", "weather-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const main = element("div", "weather-main");
  const details = element("div", "weather-details");
  const notice = element("div", "weather-notice");
  status.append(main, details, notice);

  const controls = element("div", "weather-controls");
  const select = element("select");
  select.setAttribute("aria-label", "Cidade para consultar o clima");
  CITIES.forEach((city, index) => {
    const option = element(
      "option",
      "",
      city.name + (index === 0 ? " (padrão)" : ""),
    );
    option.value = city.id;
    select.append(option);
  });
  const localOption = element("option", "", "Minha localização");
  localOption.value = "geolocation";
  localOption.disabled = true;
  localOption.hidden = true;
  select.append(localOption);
  const locate = element("button", "", "Usar localização");
  locate.type = "button";
  locate.title = "Pedir ao navegador sua localização para consultar o clima";
  const refresh = element("button", "", "↻");
  refresh.type = "button";
  refresh.title = "Atualizar clima";
  refresh.setAttribute("aria-label", "Atualizar clima");
  controls.append(select, locate, refresh);
  const attribution = element("a", "weather-attribution", "Dados: Open-Meteo");
  attribution.href = "https://open-meteo.com/";
  attribution.target = "_blank";
  attribution.rel = "noopener noreferrer";
  attribution.title = "Dados meteorológicos Open-Meteo, licença CC BY 4.0";
  container.replaceChildren(status, controls, attribution);

  function syncSelection() {
    localOption.hidden = location.id !== "geolocation";
    select.value = location.id;
  }

  function showLocation() {
    const suffix =
      location.id === "campinas" ? " · cidade padrão do projeto" : "";
    return location.name + suffix;
  }

  function showLoading() {
    container.dataset.state = "loading";
    container.setAttribute("aria-busy", "true");
    main.textContent = "Consultando clima…";
    details.textContent = showLocation();
    notice.textContent = "";
    refresh.disabled = true;
  }

  function showReading(record, cached) {
    const reading = record.reading;
    const [condition, symbol] = CONDITIONS[reading.code];
    const icon = element("span", "weather-icon", symbol);
    icon.setAttribute("aria-hidden", "true");
    const temperature = element(
      "strong",
      "",
      `${reading.temperature.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      })} °C`,
    );
    main.replaceChildren(icon, temperature, element("span", "", condition));
    const [date, time] = reading.time.split("T");
    const [year, month, day] = date.split("-");
    details.textContent = `${showLocation()} · ${day}/${month}/${year} às ${time.slice(0, 5)}`;
    details.title = "Data e hora dos dados no fuso da cidade consultada";
    notice.textContent = cached
      ? "Clima informativo · cache de até 15 min"
      : "Clima informativo";
    container.dataset.state = "ready";
    container.setAttribute("aria-busy", "false");
    refresh.disabled = false;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(
      () => {
        if (document.visibilityState !== "hidden") loadWeather();
      },
      Math.max(1000, CACHE_DURATION - (Date.now() - record.fetchedAt) + 100),
    );
  }

  function showError(message) {
    main.textContent = "Clima indisponível";
    details.textContent = showLocation();
    notice.textContent = `${message} Use ↻ para tentar novamente.`;
    container.dataset.state = "error";
    container.setAttribute("aria-busy", "false");
    refresh.disabled = false;
  }

  async function loadWeather(force = false) {
    if (destroyed) return;
    const number = ++requestNumber;
    activeRequest?.abort();
    activeRequest = null;
    clearTimeout(refreshTimer);
    const requestedLocation = { ...location };
    const cached = !force && readCache(requestedLocation);
    if (cached) {
      showReading(cached, true);
      return;
    }
    showLoading();
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(requestedLocation.latitude),
      longitude: String(requestedLocation.longitude),
      current: "temperature_2m,weather_code",
      temperature_unit: "celsius",
      timezone: "auto",
    }).toString();
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("HTTP_ERROR");
      const data = await response.json();
      const reading = {
        temperature: data?.current?.temperature_2m,
        code: data?.current?.weather_code,
        time: data?.current?.time,
      };
      if (
        data?.current_units?.temperature_2m !== "°C" ||
        !validReading(reading)
      ) {
        throw new Error("INVALID_DATA");
      }
      if (number === requestNumber && !destroyed) {
        showReading(saveCache(requestedLocation, reading), false);
      }
    } catch (error) {
      if (number !== requestNumber || destroyed) return;
      const message =
        error.name === "AbortError"
          ? "A consulta excedeu 8 segundos."
          : error.message === "INVALID_DATA"
            ? "A API retornou dados incompletos."
            : "Não foi possível consultar a API. Verifique sua conexão.";
      showError(message);
    } finally {
      clearTimeout(timeout);
      if (number === requestNumber) activeRequest = null;
    }
  }

  select.addEventListener("change", () => {
    const selected = CITIES.find((city) => city.id === select.value);
    if (!selected) return;
    // Uma escolha explícita de cidade tem precedência sobre um pedido GPS pendente.
    locationNumber += 1;
    locate.disabled = false;
    locate.textContent = "Usar localização";
    location = { ...selected };
    syncSelection();
    writeStorage(PREFERENCE_KEY, location);
    loadWeather();
  });
  refresh.addEventListener("click", () => loadWeather(true));
  locate.addEventListener("click", () => {
    if (!navigator.geolocation) {
      notice.textContent = "Geolocalização indisponível. Escolha uma cidade.";
      return;
    }
    const number = ++locationNumber;
    locate.disabled = true;
    locate.textContent = "Localizando…";
    notice.textContent = "Autorize a localização no navegador, se desejar.";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (number !== locationNumber || destroyed) return;
        locate.disabled = false;
        locate.textContent = "Usar localização";
        const { latitude, longitude } = position.coords;
        if (!validCoordinates(latitude, longitude)) {
          notice.textContent =
            "O navegador não forneceu uma localização válida. Cidade mantida.";
          return;
        }
        location = {
          id: "geolocation",
          name: "Minha localização",
          latitude: Number(latitude.toFixed(3)),
          longitude: Number(longitude.toFixed(3)),
        };
        syncSelection();
        writeStorage(PREFERENCE_KEY, location);
        loadWeather();
      },
      (error) => {
        if (number !== locationNumber || destroyed) return;
        locate.disabled = false;
        locate.textContent = "Usar localização";
        notice.textContent =
          error.code === 1
            ? "Permissão de localização negada. Cidade anterior mantida."
            : "Não foi possível obter sua localização. Cidade anterior mantida.";
      },
      {
        enableHighAccuracy: false,
        timeout: REQUEST_TIMEOUT,
        maximumAge: CACHE_DURATION,
      },
    );
  });

  const onVisible = () => {
    if (document.visibilityState === "visible" && !activeRequest) loadWeather();
  };
  document.addEventListener("visibilitychange", onVisible);
  const api = {
    refresh: () => loadWeather(true),
    destroy() {
      destroyed = true;
      requestNumber += 1;
      locationNumber += 1;
      activeRequest?.abort();
      clearTimeout(refreshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      controllers.delete(container);
    },
  };
  controllers.set(container, api);
  syncSelection();
  loadWeather();
  return api;
}

window.ClimaAcolhe.weather = { initWeather };
})();
