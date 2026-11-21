// Largura real (Pixel 7 e 360 px): conteúdo vs largura do ecrã emulado. Em emulação de telemóvel o
// Chromium tira zoom e alarga a janela quando o conteúdo é mais largo, por isso innerWidth não serve.
// Uso: node largura-real.mjs <cópia de trabalho>
import path from "node:path";
const WT = path.resolve(process.argv[2]);
const { servir, abrir, lancar } = await import(path.join(WT, "testes-browser/apoio.mjs"));
const s = await servir(); const b = await lancar();
const medir = p => p.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, janela: innerWidth, ecra: screen.width, cliente: document.documentElement.clientWidth }));
const ids = ["ria", "praia_faro", "ancao", "almargem", "molhe_quarteira", "vilamoura", "molhe_vilamoura", "falesia"];
for (const disp of ["Pixel 7", { width: 360, height: 780 }]) {
  const { contexto, pagina } = await abrir(b, disp);
  const nome = typeof disp === "string" ? "Pixel 7" : "360 px";
  const linhas = [];
  const ver = async (rot, url, sel, depois) => {
    await pagina.goto(`${s.url}${url}`); await pagina.waitForSelector(sel); if (depois) await depois();
    await pagina.waitForTimeout(250);
    const m = await medir(pagina);
    const larga = m.conteudo > m.ecra || m.janela > m.ecra;
    linhas.push(`${larga ? "ALARGA" : "ok    "} ${rot}: conteúdo ${m.conteudo} px, janela ${m.janela} px, ecrã ${m.ecra} px`);
  };
  await ver("início", "/", ".cartoes .cartao");
  await ver("comparador", "/comparador.html", ".linha-comp");
  for (const id of ids) await ver(`pesqueiro ${id}`, `/pesqueiro.html?id=${id}`, "h1");
  await ver("mapa", "/mapa.html", "#mapa");
  await ver("fontes", "/fontes.html", "main");
  await ver("diagnóstico", "/diagnostico.html", "main");
  await ver("histórico", "/historico.html", "main");
  await ver("guia", "/guia.html", "main");
  await ver("estatísticas", "/estatisticas.html", "main");
  await ver("diário (vazio)", "/diario.html", "main");
  await ver("diário (saída aberta)", "/diario.html", "main", async () => {
    await pagina.click("#nova-saida"); await pagina.waitForSelector("dialog#dialogo-saida[open] form");
    await pagina.selectOption("[name=pesqueiro]", "praia_faro"); await pagina.fill("[name=dia]", "2026-11-15");
    await pagina.fill("[name=horaInicio]", "07:00"); await pagina.fill("[name=horaFim]", "10:30");
    const c = pagina.locator(".captura").nth(0); await c.locator("select").selectOption("robalo"); await c.locator("input[name^=cap-quantidade]").fill("1");
    await pagina.click("#form-saida button[type=submit]"); await pagina.waitForSelector(".saida");
    await pagina.click(".saida summary"); await pagina.waitForSelector(".condicoes");
  });
  console.log(`== ${nome}\n${linhas.join("\n")}`);
  await contexto.close();
}
await b.close(); await s.fechar();
