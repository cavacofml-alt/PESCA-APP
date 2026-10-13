// Análise por dia: junta as regras pela prioridade Limo > Marés > Potência > Pressão >
// Temperatura. (A regra de segurança foi retirada por decisão do utilizador, 13/10/2026.)
// Função pura: recebe os dados já obtidos e devolve o resultado.
//
// entrada = {
//   dias: ["AAAA-MM-DD", ...]          dias civis de Lisboa a analisar (índice 0 = hoje)
//   pontos: { faroMar, faroTerra, quarteiraMar, quarteiraTerra }   resultados das fontes
//           ({ ok, data } do Open-Meteo); série completa, com os dias anteriores
//   mares: eventos validados (validateTides) ou null se a tabela não foi obtida
//   sol: (dia, ponto) => { nascer: ms|null, por: ms|null }   (SunCalc, pelo chamador)
//   config
// }
import { horasOpenMeteo, porDia } from "./serie.js";
import { potenciaMaximaDoDia } from "./potencia.js";
import { limoDoDia } from "./limo.js";
import { ladosDoDia } from "./molhe.js";
import { amplitudeDoDia, repontosDoDia, CLASSE_MARE } from "./mares.js";
import { pressaoDoDia } from "./pressao.js";
import { aguaDoDia } from "./agua.js";
import { alinhamentosDoDia } from "./alinhamento.js";
import { anomaliasDoDia } from "./anomalias.js";
import { aguaTurvaDoDia } from "./chuva.js";
import { notaDouradaRia, notaDouradaMolhe, notaRobalo, ordenarMelhoresDias, ESTADO_NOTA } from "./notas.js";

function prepararPontos(pontos) {
  const out = {};
  for (const [nome, r] of Object.entries(pontos ?? {})) {
    const horas = r?.ok ? horasOpenMeteo(r.data) : [];
    out[nome] = { obtido: Boolean(r?.ok), fonte: r?.source ?? null, lidoEm: r?.readAt ?? null, horas, dias: porDia(horas) };
  }
  return out;
}

const cfgMarDe = config => ({ ...config.mar, coeficiente: config.potenciaOndas.coeficiente });

function analisarPonto(p, dia) {
  if (!p) return null;
  const doDia = p.dias.get(dia) ?? [];
  return { doDia, todas: p.horas };
}

export function analisarDias({ dias, pontos, mares, sol, config }) {
  const P = prepararPontos(pontos);
  const cfgMar = cfgMarDe(config);
  const resultado = dias.map((dia, indice) => {
    const amplitude = amplitudeDoDia(mares, dia, config.mares);
    const repontos = repontosDoDia(mares, dia);

    // Cálculos por ponto (cada um uma vez).
    const porPonto = {};
    const calcularPonto = nome => {
      if (porPonto[nome] !== undefined) return porPonto[nome];
      const a = analisarPonto(P[nome], dia);
      porPonto[nome] = a && { ...a, fonte: P[nome].fonte, lidoEm: P[nome].lidoEm, obtido: P[nome].obtido };
      return porPonto[nome];
    };

    const pesqueiros = {};
    for (const [id, pq] of Object.entries(config.pesqueiros)) {
      const mar = pq.mar ? calcularPonto(pq.mar) : null;
      const terra = calcularPonto(pq.terra);
      const agua = pq.agua ? calcularPonto(pq.agua) : null;

      const potencia = mar ? potenciaMaximaDoDia(mar.doDia, cfgMar.coeficiente) : null;
      const limo = mar ? limoDoDia(mar.doDia, terra?.doDia ?? [], cfgMar) : null;
      const pressao = terra ? pressaoDoDia(terra.doDia, terra.todas, config.pressao) : null;
      const aguaT = agua ? aguaDoDia(agua.todas, dia, config.temperaturaAgua) : null;
      const chuva = aguaTurvaDoDia(terra?.doDia ?? [], dia, config.chuva);
      const s = sol ? sol(dia, pq.terra) : null;
      const alinhamento = alinhamentosDoDia(repontos, s, config.alinhamento);
      const anomalias = terra ? anomaliasDoDia(terra.doDia, config.anomalias) : null;
      const lados = pq.tipo === "molhe" && mar ? ladosDoDia(mar.doDia, terra?.doDia ?? [], cfgMar) : null;

      const fatores = {
        classeMare: amplitude.classe, motivoMare: amplitude.motivo,
        alinhado: alinhamento.alinhado, motivoAlinhamento: alinhamento.motivo,
        descidaPressao: pressao?.descida.activo ?? null, motivoPressao: pressao?.descida.motivo ?? (pressao ? null : "pressão não obtida"),
        altaEstavel: pressao?.altaEstavel.valor ?? null, motivoAltaEstavel: pressao?.altaEstavel.motivo ?? null,
        aguaAfasta: aguaT?.afastaDourada ?? null, motivoAgua: aguaT?.motivo ?? null,
        turva: chuva.turva, motivoChuva: chuva.motivo,
        potenciaMax: potencia?.status === "obtido" ? potencia.valorExacto : null,
        limo: limo?.limo ?? null, motivoLimo: limo?.motivo ?? null
      };

      const notas = {};
      if (pq.especies.includes("dourada")) {
        notas.dourada = pq.tipo === "molhe" ? notaDouradaMolhe(fatores, config.pontuacao, config.mar) : notaDouradaRia(fatores, config.pontuacao);
      }
      if (pq.especies.includes("robalo")) {
        notas.robalo = notaRobalo(fatores, config.pontuacao, config.mar, { tipo: pq.tipo });
      }

      const avisosTexto = [];
      if (pq.tipo === "ria" && amplitude.classe === CLASSE_MARE.VIVA) {
        avisosTexto.push("Marés vivas: Ria inútil para dourada; apostar no robalo no mar/bicos nos repontos, se não houver limo.");
      }
      if (lados) avisosTexto.push(lados.aviso);
      if (anomalias?.assinalar) avisosTexto.push(`Valores anómalos de vento/rajada: ${anomalias.mensagem}.`);
      if (chuva.turva === null) avisosTexto.push(chuva.motivo);
      if (potencia?.avisos?.length) avisosTexto.push(...potencia.avisos);

      pesqueiros[id] = { nome: pq.nome, pontos: { mar: pq.mar, terra: pq.terra, agua: pq.agua },
        notas, potencia, limo: limo && { limo: limo.limo, motivo: limo.motivo ?? null, horasComLimo: limo.horasComLimo ?? [] },
        lados, pressao, agua: aguaT, alinhamento, anomalias, avisos: avisosTexto };
    }

    const melhor = especie => {
      const v = Object.values(pesqueiros).map(p => p.notas[especie]).filter(n => n?.estado === ESTADO_NOTA.OK).map(n => n.nota);
      return v.length ? Math.max(...v) : null;
    };
    const alinhado = Object.values(pesqueiros).some(p => p.alinhamento.alinhado === true);
    return { dia, indice, amplitude, repontos, alinhado, pesqueiros,
      melhorRobalo: melhor("robalo"), melhorDourada: melhor("dourada") };
  });
  return { dias: resultado, melhoresDias: ordenarMelhoresDias(resultado).map(d => d.dia) };
}
