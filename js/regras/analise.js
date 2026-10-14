// Análise por dia: junta as regras pela prioridade Limo > Marés > Potência > Pressão >
// Temperatura. (A regra de segurança foi retirada por decisão do utilizador, 13/10/2026.)
// Função pura: recebe os dados já obtidos e devolve o resultado.
//
// entrada = {
//   dias: ["AAAA-MM-DD", ...]          dias civis de Lisboa a analisar (índice 0 = hoje)
//   pontos: { mar: { <ponto>: resultado do Open-Meteo Marine }, terra: { <ponto>: resultado do
//           Open-Meteo Forecast } } — chaves de config.locais; séries completas, com os dias
//           anteriores. Mar e terra separados: o mesmo ponto pode ter as duas fontes.
//   mares: eventos validados (validateTides) ou null se a tabela não foi obtida
//   sol: (dia, ponto) => { nascer: ms|null, por: ms|null }   (SunCalc, pelo chamador)
//   config
// }
import { horasOpenMeteo, porDia, instantesDoDia } from "./serie.js";
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
import { porPeriodo, PERIODOS_PADRAO } from "./periodos.js";

// Nota do dia = a do melhor período (com o nome do período; decisão aprovada na Fase 1). Em
// empate, prefere-se a nota completa (sem parcelas por avaliar). Se algum período ficou n.d.,
// a nota do dia é só a melhor conhecida: completa=false, periodosSemNota com os nomes e o
// intervalo do dia vai até ao máximo da escala (o período sem nota podia ter nota mais alta).
// Sem nenhum período com nota → n.d. do primeiro período, com o motivo.
function melhorDosPeriodos(periodos, especie, maximo = 5) {
  const comNota = periodos.map(p => ({ p, n: p.notas[especie] })).filter(x => x.n);
  if (!comNota.length) return undefined;
  const ok = comNota.filter(x => x.n.estado === ESTADO_NOTA.OK);
  if (!ok.length) return { ...comNota[0].n, periodo: comNota[0].p.nome };
  const melhor = (a, b) => (b.n.nota > a.n.nota || (b.n.nota === a.n.nota && b.n.completa && !a.n.completa) ? b : a);
  const escolhido = ok.reduce(melhor);
  const periodosSemNota = comNota.filter(x => x.n.estado !== ESTADO_NOTA.OK).map(x => x.p.nome);
  const intervalo = {
    min: Math.max(...ok.map(x => x.n.intervalo.min)),
    max: periodosSemNota.length ? maximo : Math.max(...ok.map(x => x.n.intervalo.max))
  };
  return { ...escolhido.n, periodo: escolhido.p.nome, intervalo, periodosSemNota,
    completa: escolhido.n.completa && periodosSemNota.length === 0 };
}

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
  const P = { mar: prepararPontos(pontos?.mar), terra: prepararPontos(pontos?.terra) };
  const cfgMar = cfgMarDe(config);
  const periodosCfg = config.periodos ?? PERIODOS_PADRAO;
  const resultado = dias.map((dia, indice) => {
    const amplitude = amplitudeDoDia(mares, dia, config.mares);
    const repontos = repontosDoDia(mares, dia);
    // Horas que o dia e cada período deviam ter (23, 24 ou 25 no dia): detectar lacunas.
    const esperadosDia = instantesDoDia(dia);
    const esperadosP = new Map([...porPeriodo(esperadosDia.map(t => ({ instante: t })), config.periodos ?? PERIODOS_PADRAO)]
      .map(([nome, rs]) => [nome, rs.map(r => r.instante)]));

    // Cálculos por ponto (cada um uma vez).
    const porPonto = {};
    const calcularPonto = (tipo, nome) => {
      const chave = `${tipo}:${nome}`;
      if (porPonto[chave] !== undefined) return porPonto[chave];
      const fonte = P[tipo][nome];
      const a = analisarPonto(fonte, dia);
      porPonto[chave] = a && { ...a, fonte: fonte.fonte, lidoEm: fonte.lidoEm, obtido: fonte.obtido };
      return porPonto[chave];
    };

    const pesqueiros = {};
    for (const [id, pq] of Object.entries(config.pesqueiros)) {
      const mar = pq.mar ? calcularPonto("mar", pq.mar) : null;
      const terra = calcularPonto("terra", pq.terra);
      const agua = pq.agua ? calcularPonto("mar", pq.agua) : null;

      const potencia = mar ? potenciaMaximaDoDia(mar.doDia, cfgMar.coeficiente, esperadosDia) : null;
      const limo = mar ? limoDoDia(mar.doDia, terra?.doDia ?? [], cfgMar, esperadosDia) : null;
      const pressao = terra ? pressaoDoDia(terra.doDia, terra.todas, config.pressao, esperadosDia) : null;
      const aguaT = agua ? aguaDoDia(agua.todas, dia, config.temperaturaAgua) : null;
      const chuva = aguaTurvaDoDia(terra?.todas ?? [], dia, config.chuva);
      const s = sol ? sol(dia, pq.terra) : null;
      const alinhamento = alinhamentosDoDia(repontos, s, config.alinhamento);
      const anomalias = terra ? anomaliasDoDia(terra.doDia, config.anomalias) : null;
      const lados = pq.tipo === "molhe" && mar ? ladosDoDia(mar.doDia, terra?.doDia ?? [], cfgMar) : null;

      // Factores diários (iguais em todos os períodos).
      const diarios = {
        classeMare: amplitude.classe, motivoMare: amplitude.motivo,
        descidaPressao: pressao?.descida.activo ?? null, motivoPressao: pressao?.descida.motivo ?? (pressao ? null : "pressão não obtida"),
        altaEstavel: pressao?.altaEstavel.valor ?? null, motivoAltaEstavel: pressao?.altaEstavel.motivo ?? null,
        aguaAfasta: aguaT?.afastaDourada ?? null, motivoAgua: aguaT?.motivo ?? null,
        turva: chuva.turva, motivoChuva: chuva.motivo
      };

      // Por período: potência, limo e alinhamento só com as horas/repontos desse período.
      const marP = porPeriodo(mar?.doDia ?? [], periodosCfg);
      const repP = repontos === null ? null : porPeriodo(repontos, periodosCfg);
      const periodos = periodosCfg.map(({ nome }) => {
        const horasMar = marP.get(nome);
        const pot = mar ? potenciaMaximaDoDia(horasMar, cfgMar.coeficiente, esperadosP.get(nome)) : null;
        const lim = mar ? limoDoDia(horasMar, terra?.doDia ?? [], cfgMar, esperadosP.get(nome)) : null;
        const ali = alinhamentosDoDia(repP === null ? null : repP.get(nome), s, config.alinhamento);
        const fatores = { ...diarios,
          alinhado: ali.alinhado, motivoAlinhamento: ali.motivo,
          potenciaMax: pot?.status === "obtido" ? pot.valorExacto : null, potenciaCompleta: pot?.completa ?? false,
          limo: lim?.limo ?? null, motivoLimo: lim?.motivo ?? null };
        const notasP = {};
        if (pq.especies.includes("dourada")) {
          notasP.dourada = pq.tipo === "molhe" ? notaDouradaMolhe(fatores, config.pontuacao, config.mar) : notaDouradaRia(fatores, config.pontuacao);
        }
        if (pq.especies.includes("robalo")) notasP.robalo = notaRobalo(fatores, config.pontuacao, config.mar, { tipo: pq.tipo });
        return { nome, notas: notasP, potencia: pot, limo: lim && { limo: lim.limo, motivo: lim.motivo ?? null }, alinhamento: ali };
      });
      const notas = {};
      for (const especie of pq.especies) notas[especie] = melhorDosPeriodos(periodos, especie, config.pontuacao.maximo ?? 5);

      const avisosTexto = [];
      if (pq.tipo === "ria" && amplitude.classe === CLASSE_MARE.VIVA) {
        avisosTexto.push("Marés vivas: Ria inútil para dourada; apostar no robalo no mar/bicos nos repontos, se não houver limo.");
      }
      if (lados) avisosTexto.push(lados.aviso);
      if (anomalias?.assinalar) avisosTexto.push(`Valores anómalos de vento/rajada: ${anomalias.mensagem}.`);
      if (chuva.turva === true) {
        const onde = pq.tipo === "ria" ? "Ria turva / excesso de água doce" : pq.tipo === "molhe" ? "água turva junto ao molhe" : "água doce na foz da ribeira";
        if (pq.tipo !== "praia" || id === "almargem") avisosTexto.push(`Chuva forte nos dias anteriores (${chuva.chuva48hMm} mm em 48 h): ${onde}.`);
      }
      if (chuva.turva === null) avisosTexto.push(`Chuva: ${chuva.motivo}`);
      if (potencia?.avisos?.length) avisosTexto.push(...potencia.avisos);

      pesqueiros[id] = { nome: pq.nome, pontos: { mar: pq.mar, terra: pq.terra, agua: pq.agua },
        notas, periodos, potencia, limo: limo && { limo: limo.limo, motivo: limo.motivo ?? null, horasComLimo: limo.horasComLimo ?? [] },
        lados, pressao, agua: aguaT, chuva, alinhamento, anomalias, avisos: avisosTexto };
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
