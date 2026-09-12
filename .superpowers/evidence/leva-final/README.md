# Evidências curadas — leva final

Base do produto: `003994ec16128364e86effdbcaea64a425e1b4a4`, branch
`codex/altura-shell`. Relatório e limitações em
`docs/testing/leva-final-e2e.md`.

- `rodadas-iniciais.json`: hashes dos logs de diagnóstico, RED/GREEN,
  teardown e unitários; não é um conjunto de resultados todos verdes.
- `rodadas-finais.json`: exits observados, hashes e rodapés da sabotagem
  no browser, restauração, wizard completo, gov e conferência de release.
- `popover-*-geometria-base.json` / `*-sabotagem.json` / `*-final.json`:
  retângulos, CSS e hit-test do mesmo formulário antes/depois do conserto.
- `degradacao-sabotagem.json` / `degradacao-final.json`: supressão real
  de frames com assinatura ativa, detector recuperando dados e aviso
  falso/verdadeiro, respectivamente.
- `agenda-*-final.json` / `editor-*-final.json`: regressão de altura nas
  duas larguras. Editor guarda somente campos geométricos/ações relevantes,
  sem o dump extenso da árvore de ancestrais.
- PNGs: popover aberto nas duas larguras e aviso do funil. São dados
  sintéticos de QA; a marca de fallback do banco local não é uma mudança
  da marca de produção.

Não versionar traces, HAR, headers, runtime.json, arquivos de credencial ou
logs integrais: os artefatos brutos ficam apenas no ambiente local.
As sabotagens foram removidas antes do build final. O wizard completo
continua vermelho após o terceiro caso; ver relatório, não inferir aceite
da jornada completa a partir do recorte verde.
