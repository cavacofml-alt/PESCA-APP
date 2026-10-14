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

export const NOME_ESPECIE = { robalo: "Robalo", dourada: "Dourada" };
export const PERIODO_CURTO = { madrugada: "madr.", "manhã": "manhã", tarde: "tarde", noite: "noite" };
