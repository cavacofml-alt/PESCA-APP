// Formatação para a interface: horas de Lisboa, números com vírgula, notas. Funções puras.
import { utcToLisbon } from "../normalizacao.js";

const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ENTIDADES[c]);

// "HH:MM" na hora legal de Portugal continental; "—" sem valor.
export function hora(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  return utcToLisbon(new Date(ms))?.slice(11, 16) ?? "—";
}
export const horaIso = iso => hora(Date.parse(iso));
// "DD/MM às HH:MM" na hora legal de Portugal continental; "—" sem valor.
export function dataHora(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const l = utcToLisbon(new Date(ms));
  return l ? `${l.slice(8, 10)}/${l.slice(5, 7)} às ${l.slice(11, 16)}` : "—";
}

// «às HH:MM» se a leitura é do mesmo dia (Lisboa) que agora; senão «a DD/MM às HH:MM».
export function quandoLido(iso, agoraIso = iso) {
  const t = Date.parse(iso), a = Date.parse(agoraIso);
  if (!Number.isFinite(t)) return "—";
  const mesmoDia = Number.isFinite(a) && utcToLisbon(new Date(t))?.slice(0, 10) === utcToLisbon(new Date(a))?.slice(0, 10);
  return mesmoDia ? `às ${hora(t)}` : `a ${dataHora(t)}`;
}
// «há 25 min», «há 3 h 10 min», «há 2 dias»; "—" sem valor. Relógio atrasado → «há 0 min».
export function idadeTexto(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `há ${Math.floor(min / 1440)} dias`;
}

// Número com vírgula decimal (pt-PT); "—" sem valor.
export function num(v, casas = 1) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(casas).replace(".", ",").replace(/^-/, "−");
}

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// "Hoje", "Amanhã" ou "sáb 17", pela posição no horizonte.
export function rotuloDia(dia, indice) {
  if (indice === 0) return "Hoje";
  if (indice === 1) return "Amanhã";
  const [a, m, d] = dia.split("-").map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}
export function diaCurto(dia) {
  const [a, m, d] = dia.split("-").map(Number);
  return `${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}`;
}

// Classe CSS e texto de uma nota do motor (ok / n.d. / por confirmar).
export function classeNota(n) {
  if (!n) return "nd";
  if (n.estado === "ok") return `n${n.nota}`;
  return n.estado === "por confirmar" ? "pc" : "nd";
}
export function textoNota(n) {
  if (!n) return "—";
  if (n.estado === "ok") return String(n.nota);
  return n.estado === "por confirmar" ? "?" : "n.d.";
}

export const ESPECIES = ["robalo", "dourada"];
export const NOME_ESPECIE = { robalo: "Robalo", dourada: "Dourada" };
export const PERIODO_CURTO = { madrugada: "madr.", "manhã": "manhã", tarde: "tarde", noite: "noite" };

// Rumo de onde vem (16 pontos, em português): 0° → N, 225° → SO.
const RUMOS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export function rumo(graus) {
  if (typeof graus !== "number" || !Number.isFinite(graus)) return "—";
  return RUMOS[Math.round((((graus % 360) + 360) % 360) / 22.5) % 16];
}

// Nome da fase da Lua a partir da fase do SunCalc (0 = nova, 0,5 = cheia).
export function nomeFaseLua(fase) {
  if (typeof fase !== "number" || !Number.isFinite(fase)) return "—";
  if (fase < 0.03 || fase > 0.97) return "Lua nova";
  if (fase < 0.22) return "Lua crescente";
  if (fase < 0.28) return "Quarto crescente";
  if (fase < 0.47) return "Crescente gibosa";
  if (fase < 0.53) return "Lua cheia";
  if (fase < 0.72) return "Minguante gibosa";
  if (fase < 0.78) return "Quarto minguante";
  return "Lua minguante";
}

export const NOME_MARE = { PM: "preia-mar", BM: "baixa-mar" };
