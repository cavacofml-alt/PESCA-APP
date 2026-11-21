// Guia (plano de evolução, PR 8, 20/11/2026): conteúdo estático e local, sem IA nem serviços externos.
// Cada tema tem duas partes separadas:
//   «Em geral»  — conceitos gerais, escritos com prudência (física das marés, das ondas e do vento,
//                 leitura de fundos, como ler uma previsão); não são regras de pesca;
//   «Nesta app» — as decisões do utilizador que a app usa, com os valores lidos do config.json (não
//                 há números escritos à mão que possam ficar desactualizados); todas provisórias.
// Não traz regras novas nem recomendações apresentadas como validadas. Função pura.
import { esc, num } from "./formato.js";

const n = (v, casas = 1) => num(v, casas);
const graus = ([a, b]) => `[${n(a, 1)}°; ${n(b, 1)}°)`;

export const TEMAS = [
  {
    id: "mares", titulo: "Ler as marés",
    geral: [
      "Na costa do Algarve a maré é semidiurna: em cada dia há, em regra, duas preia-mares e duas baixa-mares, com cerca de seis horas entre uma e a seguinte.",
      "A amplitude é a diferença de altura entre uma preia-mar e a baixa-mar a seguir (ou antes). É maior nas marés vivas, perto da lua nova e da lua cheia, e menor nas marés mortas, perto dos quartos crescente e minguante.",
      "O reponto é a altura em que a maré deixa de encher ou de vazar, à volta da preia-mar e da baixa-mar. Nas barras e dentro de uma ria, a corrente pode inverter-se mais tarde do que a hora da preia-mar ou da baixa-mar.",
      "As alturas das tabelas oficiais estão referidas ao zero hidrográfico, um nível abaixo das baixa-mares habituais; por isso quase nunca são negativas.",
      "A tabela é uma previsão astronómica: o vento e a pressão atmosférica podem pôr a água acima ou abaixo do que ela indica."
    ],
    naApp: c => [
      "Tabela oficial do Instituto Hidrográfico para Faro-Olhão (marégrafo da Culatra), horas convertidas para a hora legal. Para a Barra do Ancão, o IH indica diferenças de −3 a +13 min em relação a Faro-Olhão: a mesma tabela serve para o mar de fora.",
      `Classes de amplitude (arredondada a 0,01 m): abaixo de ${n(c.mares.mortaMaxExclusivoM, 2)} m, morta; de ${n(c.mares.mortaMaxExclusivoM, 2)} a ${n(c.mares.vivaMinExclusivoM, 2)} m, intermédia; acima de ${n(c.mares.vivaMinExclusivoM, 2)} m, viva.`,
      `Dourada na Ria: base ${c.pontuacao.douradaRia.baseAmplitude.morta} com maré morta, ${c.pontuacao.douradaRia.baseAmplitude.intermedia} com intermédia, ${c.pontuacao.douradaRia.baseAmplitude.viva} com viva.`,
      `Alinhamento: um reponto a ${c.alinhamento.distanciaMaximaSolRepontoMinutos} min ou menos do nascer ou do pôr do Sol dá +${c.pontuacao.robaloMar.alinhamentoRepontoSol} no robalo e +${c.pontuacao.douradaRia.alinhamentoRepontoSol} na dourada, no período.`,
      "Marés sempre por extenso (preia-mar, baixa-mar); a curva do «hora a hora» é só ilustrativa: os valores são os da tabela."
    ]
  },
  {
    id: "ondulacao", titulo: "Interpretar a ondulação",
    geral: [
      "A altura significativa (Hs) é uma medida estatística da agitação: anda perto da média do terço mais alto das ondas. Ondas isoladas podem ser bastante maiores: num registo longo, com muitas ondas, é estatisticamente possível aparecer alguma perto do dobro de Hs, o que não quer dizer que aconteça em cada hora.",
      "O período é o tempo entre duas ondas. Há várias definições (de pico, médio, de energia) que dão valores diferentes para o mesmo mar: só se devem comparar períodos com a mesma definição.",
      "A ondulação de fundo vem de longe e tem período mais longo; a vaga de vento é feita pelo vento perto, com período curto e mar mais desarrumado. Muitas vezes há as duas ao mesmo tempo, de direcções diferentes.",
      "A direcção da ondulação diz de onde vêm as ondas.",
      "Perto da costa o fundo muda a onda: em pouca água empina e rebenta, e os bancos e as cavas mudam onde rebenta. As previsões são para células de vários quilómetros, ao largo.",
      "A energia das ondas cresce com o quadrado da altura e com o período; em águas fundas, a potência por metro de frente de onda é aproximadamente 0,49 × Hs² × T (kW/m), com T o período de energia."
    ],
    naApp: c => [
      `Potência: P ≈ ${n(c.potenciaOndas.coeficiente, 2)} × Hs² × T com o «wave_period» do Open-Meteo, cuja definição espectral não está confirmada: é um indicador provisório de águas fundas, não a energia na rebentação. Sem esse período, a potência fica «não obtida».`,
      `Qualquer componente com período abaixo de ${n(c.mar.periodoVagaVentoSegundos, 0)} s conta como vaga de vento, mesmo que a fonte lhe chame ondulação de fundo.`,
      `Mar mexido: Hs de ${n(c.mar.hsMarMexidoM, 1)} m ou mais, ou potência de ${n(c.mar.potenciaMarMexidoKWm, 1)} kW/m ou mais.`,
      `Robalo: potência abaixo de ${n(c.mar.potenciaRobaloMinimaKWm, 1)} kW/m → ${c.pontuacao.robaloMar.potenciaAbaixo1}; de ${n(c.mar.potenciaRobaloMinimaKWm, 1)} a ${n(c.mar.potenciaRobaloIntermediaKWm, 1)} kW/m → ${c.pontuacao.robaloMar.potenciaDe1Abaixo15}; ${n(c.mar.potenciaRobaloIntermediaKWm, 1)} kW/m ou mais, sem limo → ${c.pontuacao.robaloMar.potencia15OuMaisSemLimo}.`,
      `Dourada: no molhe, potência de ${n(c.mar.potenciaDouradaMolheMaximaKWm, 1)} kW/m ou mais → ${c.pontuacao.limitesObrigatorios.douradaMolhePotencia15OuMais}; nas praias, ${n(c.mar.potenciaDouradaPraiaMaximaKWm, 1)} kW/m ou mais → ${c.pontuacao.limitesObrigatorios.douradaPraiaPotencia15OuMais}.`,
      "A boia de Faro («Mar agora») mede ao largo, a 90 m de fundo: não é o mar do pesqueiro e não entra nas notas."
    ]
  },
  {
    id: "vento", titulo: "Vento e orientação da costa",
    geral: [
      "O vento indica-se pela direcção de onde sopra e pela velocidade, em nós (1 nó = 1,852 km/h). A rajada é o pico de pouca duração; para a vaga conta sobretudo o vento sustentado, mas também quanto tempo sopra, a distância de mar sobre a qual sopra e a direcção.",
      "Vento de terra para o mar (terral) tende a alisar a superfície junto à costa; vento do mar para terra levanta vaga. Se uma direcção é terral ou do mar depende de como cada praia está virada: no mapa vê-se a orientação da costa.",
      "Vento forte e persistente numa direcção cria vaga dessa direcção; quando acalma, a vaga demora a baixar.",
      "Rajadas muito acima do vento médio podem indicar instabilidade, ou um valor estranho na previsão."
    ],
    naApp: c => [
      `Sectores (provisórios): Levante/Sudeste ${graus(c.mar.sectoresGraus.levanteSudeste)}, Sul/Sudoeste/Oeste ${graus(c.mar.sectoresGraus.sulSudoesteOeste)}, Norte/Noroeste ${graus(c.mar.sectoresGraus.norteNoroeste)}.`,
      "Limo: nas praias, vento, ondulação de fundo ou vaga de Levante/Sudeste com mar mexido → robalo e dourada 1. No molhe o limo não baixa a nota; o lado de pesca segue a vaga e há sempre o aviso de limo à deriva.",
      `Mar de Sul ${graus(c.mar.sulPorConfirmarGraus)}: «por confirmar» no terreno.`,
      `Valores anómalos: rajada acima de ${n(c.anomalias.rajadaSobreVentoMedioMaximo, 0)} vezes o vento médio, só com vento médio de ${n(c.anomalias.ventoMedioMinimoNos, 0)} nós ou mais → «confirmar antes de sair».`,
      "Vento a 0 nós não tem direcção e não conta como componente."
    ]
  },
  {
    id: "fundos", titulo: "Ler os fundos e as estruturas",
    geral: [
      "As cotas do fundo dão a altura em relação a uma referência. A água por cima de um ponto é a altura da maré menos a cota: com a maré a 2,5 m, um fundo à cota −1,0 m tem 3,5 m de água.",
      "Nas praias de areia formam-se bancos (zonas mais altas) e cavas (mais fundas, muitas vezes paralelas à costa). Mudam com os temporais e com as estações: um levantamento vale para a data em que foi feito.",
      "Molhes e esporões mudam a ondulação e as correntes à sua volta: um lado pode ficar abrigado e o outro exposto.",
      "Medir não é o mesmo que estimar: levantamentos por barco, LiDAR ou GNSS medem; imagens de satélite só permitem estimar, com erro."
    ],
    naApp: () => [
      "Cotas ao zero hidrográfico, a mesma referência da tabela de marés.",
      "COSMO (Agência Portuguesa do Ambiente): medido, de 2025 ou de 2020 consoante a zona, com a data em cada balão.",
      "LiDAR 2011 (Instituto Hidrográfico): medido há 15 anos; as cotas estão à LAT, que fica 0 a 0,22 m acima do zero hidrográfico, por isso a água por cima aparece em intervalo.",
      "Satélite (Sentinel-2): estimado, com erro de 0,7 a 0,8 m na validação; contorno tracejado e «sat.» no mapa.",
      "Fundões e cabeços: critérios provisórios. Fundo típico das praias: cota mediana a 100, 150 e 200 m da linha de meia-maré; só informação, não entra nas notas."
    ]
  },
  {
    id: "app", titulo: "Usar as informações da app",
    geral: [
      "Uma previsão é uma estimativa para uma hora e um sítio; muda de leitura para leitura e é mais incerta quanto mais à frente estiver.",
      "Um valor só serve com a fonte, a hora a que foi lido e o tipo (medido, previsto, estimado ou calculado)."
    ],
    naApp: c => [
      `Notas de ${c.pontuacao.minimo} a ${c.pontuacao.maximo} por período (${c.periodos.map(p => p.nome).join(", ")}, hora de Portugal continental); a nota do dia é a do melhor período. Todas provisórias.`,
      "Nota incompleta: há parcelas por avaliar; aparece com contorno tracejado e o intervalo possível. «n.d.»: sem dados suficientes (nunca conta como zero). «?»: por confirmar no terreno.",
      "Prioridade quando as regras chocam: limo, marés, potência, pressão, temperatura.",
      `Pressão: descida de ${n(c.pressao.descidaAtiva24hHpa, 0)} hPa ou mais em 24 h → +${c.pontuacao.robaloMar.descidaPressao} no robalo e +${c.pontuacao.douradaRia.descidaPressao} na dourada; pressão alta e estável (${n(c.pressao.altaEstavelMinHpa, 0)} hPa ou mais, variação abaixo de ${n(c.pressao.variacaoEstavelMaxExclusivaHpa, 0)} hPa em 24 h) → ${c.pontuacao.douradaRia.pressaoAltaEstavel} na dourada.`,
      `Água: a dourada prefere cerca de ${n(c.temperaturaAgua.temperaturaPreferidaDouradaC, 0)} °C; uma descida de ${n(c.temperaturaAgua.descidaDesfavoravelC, 0)} °C ou mais em relação à semana anterior → ${c.pontuacao.douradaRia.descidaTemperaturaAgua} na dourada (a semana anterior são previsões arquivadas, não medições).`,
      `Chuva: ${n(c.chuva.limiar48hMm, 0)} mm ou mais nas ${c.chuva.janelaHoras} h antes do dia → água turva na Ria, no molhe e na foz do Almargem.`,
      "Sem rede, a app mostra a última previsão guardada, sempre marcada como arquivada e com a hora da leitura.",
      "A app não avalia a segurança: essa avaliação é de quem vai pescar (decisão do utilizador)."
    ]
  },
  {
    id: "saida", titulo: "Preparar e registar uma saída",
    geral: [
      "Antes de sair, ver a previsão para as horas em que vai estar no pesqueiro, de onde vem e a que horas foi lida, e confirmá-la com o que se vê (câmaras, estações de vento, boia).",
      "A previsão não substitui o que se vê no local.",
      "Depois, registar enquanto se lembra: horas, sítio, o que apanhou, tamanhos e o que notou na água, no vento e no mar.",
      "Registar também as saídas sem capturas: sem elas, os números do diário enganam."
    ],
    naApp: c => [
      "O diário junta a cada saída as condições previstas da leitura guardada no aparelho (nunca medições no pesqueiro), quando existe uma que cubra as horas da saída.",
      `Os registos só existem neste aparelho: «Exportar cópia» regularmente (há um lembrete aos ${c.persistencia.lembreteCopiaSegurancaDias} dias).`,
      "As estatísticas são descritivas, com o número de registos em cada valor; com menos de 10 saídas são amostra pequena.",
      "Os registos nunca mudam as regras nem os limiares; qualquer mudança é decisão do utilizador."
    ]
  }
];

export function renderGuia(config) {
  return `<header class="topo"><div><h1>Guia</h1><p class="lido">Conceitos gerais e as decisões que a app usa · <a href="./fontes.html">voltar às fontes</a></p></div></header>
    <p class="aviso-origem leve">Em cada tema, «Em geral» explica conceitos com prudência; «Nesta app» mostra, à parte, as decisões do utilizador que a app usa, com os valores do config (todas provisórias). Não é um manual de pesca nem traz regras novas.</p>
    <nav class="indice-guia" aria-label="Temas"><ol>${TEMAS.map(t => `<li><a href="#${t.id}">${esc(t.titulo)}</a></li>`).join("")}</ol></nav>
    ${TEMAS.map(t => `<section class="bloco-pq tema-guia" id="${t.id}" aria-label="${esc(t.titulo)}">
      <h2>${esc(t.titulo)}</h2>
      <div class="geral"><h3>Em geral</h3>${t.geral.map(p => `<p>${esc(p)}</p>`).join("")}</div>
      <div class="na-app"><h3>Nesta app <small>· decisões do utilizador, provisórias</small></h3><ul>${t.naApp(config).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </section>`).join("")}
    <p class="legenda">Guia estático, guardado na app: funciona sem rede.</p>`;
}
