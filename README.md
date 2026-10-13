# Surfcasting Algarve — Fase 2

Módulos de consulta de dados e validação inicial, sem build e sem dependências de runtime obrigatórias.

## Executar localmente

Os módulos ES e `fetch()` não funcionam de forma fiável a partir de `file://`. Servir a pasta por HTTP, por exemplo através de GitHub Pages ou de um servidor estático local.

## Estado das fontes

- Open-Meteo Marine: consulta horária marinha.
- Open-Meteo Forecast: vento, rajadas, pressão e precipitação. **Não pede nascer/pôr do Sol.**
- IPMA avisos: obtém o JSON público; a interpretação dos avisos e a conversão temporal serão implementadas/validadas no motor da fase seguinte.
- IPMA estado do mar: consulta os três ficheiros e filtra `globalIdLocal=1080526`.
- Marés locais: valida formato, ordem, alternância PM/BM e intervalos de 30 a 480 minutos. `mares/2026.json` está vazio até chegar a tabela oficial.
- SunCalc: adaptador preparado; colocar uma distribuição local licenciada em `vendor/suncalc.js` e carregá-la antes de usar o adaptador. A aplicação não consulta outra fonte solar.

## Modelo de valor

A função `leitura()` em `js/normalizacao.js` cria o envelope comum com `value`, `unit`, `source`, `readAt`, `validAt`, `tipo`, `status`, `provisional` e `note`. Valores ausentes ficam `null` e estado `não obtido`.

## Testes offline

`testes/dados-teste.js` contém fixtures fixas e marcadas como dados de teste, incluindo timestamps na mudança de hora de 25/10/2026. Não devem ser usados como previsão real. Os testes unitários das regras serão completados na Fase 3.

## Limitações desta entrega

- O IPMA pode alterar nomes/estrutura de campos; a consulta verifica a forma geral, mas o mapeamento semântico dos avisos requer confirmação com respostas reais.
- O `sw.js` guarda a shell, não garante previsões offline nem apresenta dados em cache como actuais.
- O JSON de marés tem deliberadamente zero eventos até ser fornecida a tabela oficial.
- O carregamento da biblioteca SunCalc local deve ser concluído antes de publicar.
