# Leitor de site na configuração inicial

Implementação em `codex/leitor-de-site-no-onboarding`. Este documento separa
contrato implementado de prova executada; o resultado final fica nas evidências.

## Contrato

- O endereço é opcional no welcome. URL + intenção de leitura são gravados no
  mesmo estado do passo; o `after` lê em segundo plano. Se o processo encerrar
  antes do callback, o cron recupera a intenção. Nenhum passo aguarda o site.
- Seis tentativas HTTP por leitura (home + até cinco páginas úteis), contando
  redirecionamentos e falhas. É leitura inicial, não espelhamento de loja.
  Teto total: 30s, 6s por requisição, 512 KiB/página, 2 MiB/leitura, 100 produtos,
  50 perguntas. Não há navegador remoto nem modelo de IA na extração.
- Texto e DNS passam pelos guards existentes, a cada destino. Só HTTP(S)
  permitido pela política vigente, redirecionamento manual e orçamento comum.
  A resolução seguida de fetch conserva a limitação de DNS rebinding documentada
  no guard existente; não se afirma pinagem de socket por IP.
- Fonte tipo `site` nasce inativa. `status`/`last_index_status` mostram a leitura;
  metadata existente guarda lease, resumo, recusas e contagens. Produtos nascem
  `origem=site`, `ativo=false`. Confirmação não troca preço nem sobrescreve
  produto já aprovado. Preço ambíguo/divergente fica fora com motivo e linha.
- A sugestão do funil lê snapshot concluído e delimita o site como dado externo.
  Falha conserva pacote e motivo. `MAX_ETAPAS` e os passos permanecem intactos:
  seis definições, seis visíveis com loja habilitada; cinco sem a etapa de loja.
- Perguntas usam revisão existente, confirmação explícita, reserva concorrente
  da fonte e hash do conteúdo conferido. O indexador não usa o resumo bruto.
  Embeddings continuam dependendo da configuração já existente da instalação.
- Done apresenta apenas dados reais pendentes; Depois é persistido por
  organização no navegador. Revisar conclui o mesmo onboarding, preservando
  guards, e só permite destinos internos pré-definidos.

## Living System Checklist

| Propriedade | Artefato concreto |
|---|---|
| Entrada e consumidores | welcome → `site/servico.ts` → funil, catálogo e acervo |
| Porta | telas existentes `/app/products` e `/app/ai/knowledge/sources`; nenhuma tela órfã nova |
| Log real | estado da fonte + `knowledge_source.updated` e confirmação do catálogo em `api_audit_log` |
| Anti-interrupção | flag durável do welcome, cron no scheduler da VPS, CAS/lease e no máximo três tentativas |
| Falha e próximo passo | motivo legível na fonte, retry manual limitado, alternativa de conteúdo manual |
| Laço de retorno | pessoa corrige/confirma FAQ e preços antes de a IA usá-los; rascunho nunca habilita atendimento |
| Mapa vivo | `docs/architecture/onboarding-site.architecture.json` |
| Distribuição | app + scheduler publicados pelo CI existente; nenhuma variável nova, migration ou edição de `.env` |

## Provas e limites

Evidências locais: `.superpowers/evidence/onboarding-site/`. Sabotagens devem
registrar vermelho e restauração; um teste que só passa não prova a proteção.

- Catálogo: PostgREST e MCP reais; filtro `ativo=true` removido → vermelho.
- Persistência: banco do baseline; crawler controlado para concorrência e falha.
- Leitor: guards reais; transporte/DNS controlados nos testes, com erros, teto,
  destinos internos, redirecionamentos, stream lento e preços ambíguos.
- UI: componentes reais; remoção do after/intenção/dispensa/allowlist → vermelho.
- E2E: spec `onboarding-leitor-de-site.spec.ts`, receptores HTTP locais e preloads
  exclusivos do harness. Não comprova DNS/TLS de um site público, provedor pago
  de IA, pareamento de telefone ou envio real de WhatsApp.

Não implementado: renderização de sites dependentes de JavaScript; leitura de
redes sociais; extração de preço por adivinhação/IA; editor novo de preços
(a tela existente permite conferir/confirmar ou deixar o rascunho inativo).
Nenhuma operação de produção, deploy, release ou alteração de schema nesta leva.

Status dos gates completos e navegação ainda deve ser preenchido após a rodada
final. Os testes focados não equivalem à suíte completa nem à publicação.
