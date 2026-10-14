const STORAGE_KEY = "samsung-remote-pairing-v1";
const SESSION_TTL = 24 * 60 * 60 * 1000;
const DEVICE_NAME = "Samsung Remote PWA";

const ui = {
  ip: document.querySelector("#tv-ip"),
  ipLabel: document.querySelector('label[for="tv-ip"]'),
  ipHelp: document.querySelector("#ip-help"),
  connectRow: document.querySelector(".connect-row"),
  connect: document.querySelector("#connect-button"),
  forget: document.querySelector("#forget-button"),
  power: document.querySelector("#power-button"),
  status: document.querySelector("#status-label"),
  dot: document.querySelector("#status-dot"),
  message: document.querySelector("#pair-message"),
  session: document.querySelector("#session-row"),
  expiry: document.querySelector("#session-expiry"),
  toast: document.querySelector("#toast"),
  install: document.querySelector("#install-button"),
};

let socket = null;
let paired = readPairing();
let toastTimeout;
let deferredInstallPrompt = null;
let expiryTimer;
const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

if (isAppleMobile) {
  ui.ipLabel.hidden = true;
  ui.ipHelp.hidden = true;
  ui.connectRow.hidden = true;
  document.querySelector(".remote").hidden = true;
  setStatus(false, "Requiere app nativa");
  ui.message.textContent = "Este enlace abre la PWA antigua. En iPhone no puede descubrir la TV automáticamente: no escribas una IP aquí. La app nativa aún no está publicada.";
}

if (paired) ui.ip.value = paired.ip;
renderPairing();
registerServiceWorker();

ui.connect.addEventListener("click", connectToTv);
ui.ip.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connectToTv();
});
ui.forget.addEventListener("click", forgetTv);
ui.power.addEventListener("click", () => sendKey("KEY_POWER"));
document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", () => sendKey(button.dataset.key));
});
ui.install.addEventListener("click", installApp);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ui.install.hidden = false;
});

window.addEventListener("appinstalled", () => {
  ui.install.hidden = true;
  showToast("App instalada en este teléfono.");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) expirePairingIfNeeded();
});

function readPairing() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved.ip !== "string" || typeof saved.token !== "string" || !Number.isFinite(saved.pairedAt)) return null;
    if (Date.now() - saved.pairedAt >= SESSION_TTL) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return saved;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function storePairing(ip, token) {
  const pairedAt = paired?.ip === ip && paired.token === token ? paired.pairedAt : Date.now();
  paired = { ip, token, pairedAt };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paired));
  renderPairing();
}

function renderPairing() {
  clearInterval(expiryTimer);
  ui.session.hidden = !paired;
  ui.forget.hidden = !paired;
  if (!paired) {
    ui.expiry.textContent = "";
    ui.ip.readOnly = false;
    return;
  }
  ui.ip.value = paired.ip;
  ui.ip.readOnly = true;
  updateExpiryLabel();
  expiryTimer = window.setInterval(updateExpiryLabel, 1000);
}

function updateExpiryLabel() {
  if (!paired) return;
  const remaining = SESSION_TTL - (Date.now() - paired.pairedAt);
  if (remaining <= 0) {
    expirePairingIfNeeded();
    return;
  }
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  ui.expiry.textContent = `Caduca en ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function expirePairingIfNeeded() {
  if (!paired || Date.now() - paired.pairedAt < SESSION_TTL) return;
  closeSocket();
  localStorage.removeItem(STORAGE_KEY);
  paired = null;
  renderPairing();
  setStatus(false, "Autorización vencida");
  ui.message.textContent = "Pasaron 24 horas. Conecta de nuevo y acepta la solicitud en la TV.";
  showToast("La autorización venció. Empareja de nuevo desde la TV.");
}

function isPrivateIPv4(value) {
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  const [a, b] = octets;
  return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}

function encodeName(name) {
  const bytes = new TextEncoder().encode(name);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function makeSocket(ip, token) {
  const query = new URLSearchParams({ name: encodeName(DEVICE_NAME) });
  if (token) query.set("token", token);
  const url = `ws://${ip}:8001/api/v2/channels/samsung.remote.control?${query.toString()}`;
  return new WebSocket(url, { targetAddressSpace: "local" });
}

function connectToTv() {
  if (isAppleMobile) {
    ui.message.textContent = "No ingreses una IP. Abre la app nativa cuando esté disponible.";
    return;
  }
  expirePairingIfNeeded();
  const ip = ui.ip.value.trim();
  if (!isPrivateIPv4(ip)) {
    ui.ip.focus();
    showToast("Escribe la IP local privada de la TV, por ejemplo 192.168.1.42.");
    return;
  }
  if (!window.isSecureContext) {
    showToast("Abre esta PWA desde GitHub Pages con HTTPS para conectarte a la red local.");
    return;
  }
  if (!("WebSocket" in window)) {
    showToast("Este navegador no admite la conexión WebSocket necesaria.");
    return;
  }
  if (typeof WebSocket !== "function" || !isChrome154OrNewer()) {
    showToast("Necesitas Chrome 154 o posterior en Android para la conexión local.");
    return;
  }

  closeSocket();
  ui.connect.disabled = true;
  ui.connect.querySelector("span:first-child").textContent = "Conectando";
  ui.message.textContent = "Solicitando conexión local. Permite el acceso a la red si Chrome lo pregunta.";
  setStatus(false, "Buscando TV");

  try {
    socket = makeSocket(ip, paired?.ip === ip ? paired.token : "");
  } catch (error) {
    finishConnectButton();
    ui.message.textContent = "Chrome no pudo abrir el canal local. Actualiza Chrome y permite el acceso a la red.";
    showToast(error instanceof TypeError ? "Actualiza Chrome a la versión 154 o posterior." : "No se pudo iniciar la conexión.");
    return;
  }

  const currentSocket = socket;
  const timeout = window.setTimeout(() => {
    if (currentSocket.readyState === WebSocket.CONNECTING) {
      currentSocket.close();
      ui.message.textContent = "No se encontró la TV en esa IP. Revisa que esté encendida y en la misma red.";
      setStatus(false, "TV no disponible");
      finishConnectButton();
    }
  }, 9000);

  currentSocket.addEventListener("open", () => {
    clearTimeout(timeout);
    setStatus(true, "Conectada a la TV");
    ui.message.textContent = "Conexión activa. Si es la primera vez, acepta el permiso en la TV.";
    finishConnectButton();
  });

  currentSocket.addEventListener("message", (event) => handleTvMessage(event.data, ip));

  currentSocket.addEventListener("error", () => {
    clearTimeout(timeout);
    setStatus(false, "Sin conexión");
    ui.message.textContent = "No se pudo conectar. Comprueba la IP, Chrome y que ambos estén en la red de la TV.";
    finishConnectButton();
  });

  currentSocket.addEventListener("close", () => {
    clearTimeout(timeout);
    if (socket === currentSocket) {
      socket = null;
      setStatus(false, "Sin conectar");
      finishConnectButton();
    }
  });
}

function isChrome154OrNewer() {
  if (!/Android/i.test(navigator.userAgent)) return false;
  const match = navigator.userAgent.match(/(?:Chrome|CriOS)\/(\d+)/);
  return Boolean(match && Number(match[1]) >= 154);
}

function handleTvMessage(rawMessage, ip) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    return;
  }
  const token = message?.data?.clients?.[0]?.attributes?.token;
  if (message.event === "ms.channel.connect" && token) {
    storePairing(ip, String(token));
    ui.message.textContent = "TV autorizada. Esta sesión caduca en 24 horas.";
    showToast("TV autorizada en este teléfono por 24 horas.");
  }
  if (message.event === "ms.channel.unauthorized") {
    setStatus(false, "Autorización pendiente");
    ui.message.textContent = "Acepta la solicitud de conexión en la pantalla de la TV.";
  }
}

function sendKey(key) {
  expirePairingIfNeeded();
  if (!paired) {
    showToast("Conecta y autoriza la TV primero. La autorización dura 24 horas.");
    ui.ip.focus();
    return;
  }
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (paired) {
      showToast("No hay conexión activa. Revisa que sigas en la red de la TV y vuelve a conectar.");
      setStatus(false, "TV fuera de la red");
    }
    return;
  }
  const command = {
    method: "ms.remote.control",
    params: { Cmd: "Click", DataOfCmd: key, Option: "false", TypeOfRemote: "SendRemoteKey" },
  };
  socket.send(JSON.stringify(command));
}

function forgetTv() {
  closeSocket();
  localStorage.removeItem(STORAGE_KEY);
  paired = null;
  renderPairing();
  ui.ip.value = "";
  setStatus(false, "Sin conectar");
  ui.message.textContent = "La autorización se borró de este teléfono.";
  showToast("TV olvidada en este teléfono.");
}

function closeSocket() {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  socket = null;
}

function finishConnectButton() {
  ui.connect.disabled = false;
  ui.connect.querySelector("span:first-child").textContent = "Conectar";
}

function setStatus(connected, label) {
  ui.status.textContent = label;
  ui.dot.classList.toggle("connected", connected);
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => ui.toast.classList.remove("visible"), 3200);
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  ui.install.hidden = true;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    showToast("No se pudo preparar el modo instalable. Recarga la página más tarde.");
  }
}
