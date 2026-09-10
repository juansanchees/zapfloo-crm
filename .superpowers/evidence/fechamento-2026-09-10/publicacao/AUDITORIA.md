# Zapfloo — preparação para repositório público

Data: 10/09/2026. Repositório: **juansanchees/zapfloo-crm**, ainda privado. Upstream: **melgarafael/DeskcommCRM**. Nenhuma mudança de visibilidade, rotação, exclusão, PR, push, deploy ou acesso à VPS nesta tarefa.

## Resultado e limites da conclusão

**Não foi confirmada credencial de produção em texto claro entre os achados do histórico Git.** Não significa garantia de ausência absoluta de segredos. Os alertas foram classificados por contexto; não escondidos com allowlist. Há um hash histórico WAHA derivado de segredo, já público no upstream, com recomendação de rotação da chave original onde tenha sido usada.

O pacote de preparação está entregue. A publicação continua uma decisão do dono; o 200 anônimo pós-publicação e a autorização para limpeza continuam pendentes. **Não declaro todas as superfícies do GitHub ou da VPS auditadas.** Logs/artefatos de Actions, anexos, imagens binárias/OCR, LFS externo, camadas Docker, refs ocultas de PR, commits inalcançáveis e dados fora do Git não foram varridos. Logs de Actions também ficam públicos: revisar antes da abertura. [GitHub: consequências da mudança](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).

## Histórico completo e cobertura

- Executado `git fetch --unshallow origin`, seguido de fetch explícito de todas as heads de origin e tags. `git rev-parse --is-shallow-repository`: **false**.
- Todas as quatro branches atualmente anunciadas por `git ls-remote --heads origin` estavam presentes. A varredura `--all` também incluiu branches locais, tags e refs upstream já disponíveis. Snapshot exato em `referencias.txt`.
- `git rev-list --all --count`: **3.872 commits**. Checagem de objetos ausentes não reportou falta.
- Main/origin: `22620d85b4023e9975d7dbfd673e9b8bd9393b96`; produção salva no remoto `codex/onboarding-roxo`: `4b9aadafdb6edc2e89eabd9b5960f97250f97aaf`.
- Gitleaks **8.30.1**, release oficial; SHA-256 do tar Darwin ARM64 conferido contra checksum da release e digest da API: `b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5`.
- Config explícita com regras padrão, sem `.gitleaksignore` do projeto, sem baseline e ignorando comentários `gitleaks:allow`. Saída `--redact=100`; os campos Secret dos 163 resultados estão redigidos.

Comando principal da rodada final (binário temporário local):

```bash
/tmp/zapfloo-public-audit.uzZOdH/gitleaks git \
  --config /Users/juansanches/Desktop/zapfloo-publicacao-2026-09-10/audit-gitleaks.toml \
  --gitleaks-ignore-path /tmp/zapfloo-public-audit.uzZOdH \
  --ignore-gitleaks-allow --log-opts='--all --full-history -m' \
  --redact=100 --no-banner --no-color --report-format=json \
  --report-path=/Users/juansanches/Desktop/zapfloo-publicacao-2026-09-10/gitleaks-merges-redacted.json \
  '/Users/juansanches/Documents/ChatGPT/CRM SAAS Deskcomm'
```

A primeira rodada sem `-m` reportou 2.952 commits com patches e 21 alertas. A rodada final inclui diffs dos merges: **3.839 commits com patches textuais**, 306,92 MB de patches, 17,8 s, **163 ocorrências brutas**, exit **1** por achados. Não foi reportada como exit 0.

A diferença de 33 para os 3.872 commits foi medida: **22 sem alterações A/M** e **11 com alterações A/M somente binárias**; os 3.839 com alterações textuais coincidem com o contador da ferramenta. Binários não foram analisados como conteúdo visual.

## Triagem — cada ocorrência detalhada em ACHADOS.md

Há **160 fingerprints distintos** nos 163 registros brutos; diferenças contra pais de merges repetem três fingerprints. Todos os commits dos alertas são ancestrais da `upstream/main` pública disponível. Ser herdado não torna um segredo seguro: a classificação abaixo veio do uso no código.

| Arquivo | Ocorrências incluindo merges | Classificação |
|---|---:|---|
| `lib/notifications/prefs.ts` | 16 | Identificador de preferências/armazenamento, não credencial |
| `lib/followup/gatilho-caso.handler.ts` | 8 | Identificador de handler |
| `lib/followup/gatilho-etapa.handler.ts` | 19 | Identificador de handler |
| `supabase/migrations/MANIFEST.md` | 13 | ID de conversa de 24 hex documentado, não chave de API |
| `tests/sonda-radar-isolamento-orgs.ts` | 13 | JWT de teste local: issuer supabase-demo, role service_role, endpoint loopback e sem ref Cloud |
| `lib/sentry/scrub.test.ts` | 12 | Token sintético de teste de sanitização |
| `app/actions/auth/signInWithPassword.test.ts` | 5 | Senha de fixture, autenticação mockada |
| `evidence/canais/baseline/e2e.txt` | 26 | UUID de registro da fixture; não valor da credencial |
| `evidence/canais/baseline/e2e-paralelo.txt` | 26 | UUID de registro da fixture; não valor da credencial |
| `tests/invariants/webhooks-secret-encryption.test.ts` | 12 | Chave sintética de banco de teste |
| `tests/invariants/webhooks-inbound.test.ts` | 12 | Chave sintética de banco de teste |
| `.env.waha` | 1 | Hash de autenticação WAHA; tratamento abaixo |

As ocorrências dos merges foram comparadas com as linhas inspecionadas na primeira rodada. Duas têm prosa diferente no MANIFEST, mas o mesmo identificador documentado, comparado em memória sem exibir o valor. Nenhuma classificação ficou pendente. `ACHADOS.md` lista **cada** commit completo, arquivo, linha, regra e classificação. `achados-sem-valores.json` fornece os mesmos dados estruturados.

Os logs de E2E foram ligados ao emissor `scripts/seed-e2e-followup-agent.ts`: ele imprime `credentialId`, um UUID de registro, e cria placeholder de credencial para teste. A palavra “credential” no log não significa que o valor da chave foi impresso.

### Hash histórico WAHA: ação proposta, nunca executada

Achado: commit `d2595e3d554024d45a5351c623b4d7f9b865ed24`, arquivo `.env.waha`, linha 1, variável `WAHA_API_KEY_HASH`. Uma segunda regra específica confirmou 128 dígitos hexadecimais, formato compatível com SHA-512 (`hash-waha.log` / `hash-waha-redacted.json`). Não é chave plaintext. O commit é ancestral do upstream público; não é um vazamento novo introduzido pelo fork.

- **Recomendo rotacionar a chave original em todo ambiente onde tenha sido usada**, mesmo sendo hash e já público. O hash pode permitir tentativa offline de adivinhação. Não sabemos se esse material foi reutilizado na sua VPS.
- **Não recomendo reescrever o fork automaticamente por esse hash herdado.** Não retiraria cópias do upstream/clones e mudaria SHAs/referências. Se o dono exigir a purga, definir escopo de branches/tags, backup e impacto antes. Nenhum histórico foi reescrito.
- Para qualquer credencial real adicional que venha a ser confirmada, a ordem será sempre **revogar/rotacionar primeiro**, depois avaliar purga de histórico, caches e refs. Nunca testar validade contra provedores nem rotacionar sozinho. [GitHub: remover dados sensíveis](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Fora os templates `.env.example` e `.env.hostgator.example`, o único caminho `.env*` adicionado no histórico foi `.env.waha`. Nenhum `.env` operacional local/VPS foi aberto. Fixtures só são seguras enquanto permanecem de teste: esta auditoria não prova que ninguém reutilizou seus valores em produção.

## Licença e atribuição

O blob `LICENSE` em main, onboarding-roxo e upstream/main tem o mesmo hash Git **db9b0a0859f03d421577569ab6209faec2eb8e8c**. Conferência adicional na API do upstream atual retornou o mesmo hash. Texto MIT integral e copyright **2026 Rafael Melgaço** preservados. O README mantém a seção MIT e links de autoria `@melgarafael`/YouTube. Não foi necessário editar a licença.

Isto verifica a preservação do aviso upstream, não substitui uma revisão jurídica de todas as dependências e ativos de terceiros. [Licença original](https://github.com/melgarafael/DeskcommCRM/blob/main/LICENSE).

## Registro de pacotes e próximos passos

- Seis pacotes ainda privados; manifests consultados com credencial existente somente em memória, sem imprimi-la/gravar token.
- Prova independente por **curl sem login**: três pacotes novos com 401 no manifest sem bearer e 401 no token anônimo. Portanto nenhum 200 de publicação foi obtido. Não confundir desafio 401 com recusa de chave SSH nem com sucesso de pull.
- Os seis digests do worker sem caminho a partir de tags foram enumerados; as quatro versões sem tag do CRM estão protegidas. Detalhes e tamanhos em `PACOTES.md` e `registry-inventory.json`.
- A conferência da VPS e a proposta final de exclusão ficam **para depois da confirmação do dono de que abriu**. Não contatamos a VPS nesta tarefa.
- Siga `CHECKLIST-DO-DONO.md`: repositório público → cada pacote novo público → curl anônimo 200 → somente então avaliar a limpeza, com dependências da VPS verificadas.

## Preservação do trabalho local

Nenhum arquivo rastreado foi editado. O checkout original segue apenas com a alteração pessoal pré-existente em `.codex/config.toml`, SHA-256 `3d25e4c7d9b904c0a919980d9eca52207da8fb8fb9b7bdc828f92956f70ca61e`. A main não mudou. O trabalho da Tarefa 2 continua no checkout isolado. Os artefatos desta auditoria estão somente nesta pasta da Área de Trabalho.
