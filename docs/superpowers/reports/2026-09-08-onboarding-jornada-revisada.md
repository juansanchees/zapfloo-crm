# Jornada revisada — prova local sintética

## Escopo confirmado

Negócio → rascunho/ensaio/revisão → conexão → autorização restrita. Segmento usa os IDs de `pacotes-de-funil`; objetivo é opcional para legado e distinto de regras. Ambos entram no snapshot: mudar qualquer um invalida a revisão. Teto total de prompt: 20.000 caracteres, sem truncamento.

Confirmar a revisão não publica. QR WORKING não avança. O último botão consome o UUID de canal relido no servidor e ativa o mesmo agente/versão revisados. Lista vazia, canal aberto ou conflitante não são substituídos pelo wizard. Recibo é histórico, retomável e não afirma política atual após edições no CRM.

O card que diagnosticava o provedor default da organização saiu somente deste setup: a seleção de modelo/credencial é explícita no ensaio. Configurar chave abre a gestão existente via exploração; não conclui a organização nem escolhe outro provider automaticamente.

A edição da lista no wizard usa `access_revision` observada no GET e precondição `restricted_only` no PATCH. Política ou lista alterada por outra aba gera conflito antes de salvar. CAS da metadata no UPDATE também protege a janela entre leitura/escrita do servidor; metadata de transporte é preservada. Consumidores gerais continuam na RPC canônica sem a precondição aditiva. Não houve nova mudança de schema para este ajuste.

## Reprodução

Usar o Supabase LOCAL com baseline aplicado e o harness E2E configurado. Nunca apontar para produção.

```sh
pnpm e2e:build
E2E_ONBOARDING_SYNTHETIC_PROVIDER=1 OPENAI_API_KEY=onboarding-local-provider-only pnpm exec playwright test tests/e2e/onboarding-ativacao-restrita.spec.ts tests/e2e/troca-de-organizacao-tem-volta.spec.ts --workers=1 --reporter=list
```

A spec nova fica deliberadamente skipped sem flag. O workflow E2E possui passo dedicado na parte 2 com a flag e a chave FICTÍCIA acima; o preload é aplicado ao processo Next e a spec fornece receiver HTTP local. Não basta a spec constar na lista geral. O workflow foi editado localmente; nenhum Actions foi disparado nesta tarefa.

O teste usa autenticação local, actions reais e PostgreSQL. Só a resposta HTTP da IA é sintética. A sessão WORKING é **fixture de banco**, não evidência de QR, WAHA, Meta ou transporte parceiro. Nenhuma chave real, envio WhatsApp ou chamada a IA externa participa da prova.

## Asserções e limites

Rodada local final: E2E 6/6 (2,1 min); unidade focada 221/221 e complemento de setup/gestão/i18n 11/11; invariantes PostgreSQL focadas 50/50 com baseline install/update; build e typecheck exit 0. Gate de evidência citada 48/48 após stage. Lint focado exit 0 (dois warnings preexistentes em testes não alterados; complemento final sem warnings).

Complemento de concorrência: unidade 8/8 após RED de cinco falhas; PostgreSQL 6/6 incluindo espera real por lock e reavaliação do CAS; build/typecheck/lint exit 0. Jornada PT/ES estendida passou 2/2 em 27,3s com conflitos de política e lista após GET. O consumidor geral passou separadamente, inclusive abertura explícita e retorno ao modo de teste. Nenhum gate global foi repetido.

- PT/ES, teclado nos CTAs, refresh/voltar e 390px sem overflow horizontal.
- Banco antes da confirmação, depois da confirmação e antes do último clique: agente inativo e sem versão publicada.
- Depois do último clique: mesmo agente e versão do ensaio; canal `allowlist/pre_go_live`; número da lista aceito e número externo recusado pelo gate canônico.
- Zero `messages`, `event_log` e `ai_agent_runs` da organização após ativação; uma única chamada HTTP de texto e nenhuma ferramenta. A ativação não faz chamada adicional.
- Recibo após refresh, reabertura para gestão e viewer fora do wizard. Spec de troca de organização cobre conflito de duas abas, troca de organização com revisão coincidente, convidado e exploração retomável sem conclusão.
- Invariantes PostgreSQL cobrem alteração de segmento/objetivo e transação Task1. O E2E revelou ISO com offset `+00:00` retornado pelo banco: DTO/estado agora aceitam offset e Z, sem alterar campos ou SQL transacional.
- Prova restrita a integração sintética local. Não certifica VPS fresca, transporte WAHA real, provedor pago, nem a suíte global; gates completos e revisão independente pertencem ao controlador.

## Evidência visual individual

Todos os nomes, negócio, mensagens e telefone são fixtures sintéticas. As imagens mostram a interface, não substituem as asserções do banco.

A marca/cores vêm da fixture local (DeskcommCRM/verde); esta prova valida fluxo e responsividade, **não a marca Zapfloo/roxo da produção**. Nenhum ajuste global de branding foi feito nesta tarefa.

- `evidence/onboarding-jornada/agente-pt-BR-desktop.png`: campos, resumo lateral e resposta revisada antes da conexão.
- `evidence/onboarding-jornada/agente-pt-BR-celular.png`: resumo abaixo dos campos e controles sem overflow em 390px.
- `evidence/onboarding-jornada/agente-es-desktop.png`: mesma jornada em espanhol.
- `evidence/onboarding-jornada/agente-es-celular.png`: layout estreito e copy em espanhol.
- `evidence/onboarding-jornada/autorizacao-pt-BR-celular.png`: canal escolhido e botão final distinto; agente ainda inativo nesta captura.
- `evidence/onboarding-jornada/autorizacao-es-celular.png`: números de teste e ausência de liberação pública.
- `evidence/onboarding-jornada/recibo-pt-BR-celular.png`: confirmação histórica depois de refresh.
- `evidence/onboarding-jornada/recibo-es-celular.png`: confirmação histórica em espanhol.
- `evidence/onboarding-jornada/conflito-pt-BR-celular.png`: salvamento antigo recusado após outra aba mudar a lista; campos preservados para conferência.
- `evidence/onboarding-jornada/conflito-es-celular.png`: mesma recuperação em espanhol, sem substituir a configuração concorrente.
