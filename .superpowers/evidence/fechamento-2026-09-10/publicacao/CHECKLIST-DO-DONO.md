# Abertura do Zapfloo — checklist do dono

Preparado em 10/09/2026. Nenhuma visibilidade foi alterada, pacote apagado ou credencial rotacionada. A decisão e os cliques abaixo são seus.

## Antes dos cliques

- Leia `AUDITORIA.md` e `ACHADOS.md`. Nenhuma credencial de produção em texto claro foi confirmada na varredura do Git. Há um hash histórico de autenticação WAHA já presente no upstream público: recomendo rotacionar a chave original nos ambientes onde tenha sido usada. A reutilização na sua VPS não foi medida. Não copie o hash nem credenciais aqui.
- A auditoria cobre o histórico Git alcançável pelas branches/tags, não logs e artefatos de Actions, anexos de issues, dumps, imagens/screenshots ou camadas das imagens Docker. Revise essas superfícies antes de torná-las públicas, especialmente logs de deploy. Não estou atestando que estejam limpas. O histórico de Actions passa a ser público junto com o repositório. [GitHub: efeitos da mudança](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
- Preserve `LICENSE`: o texto MIT e o copyright de Rafael Melgaço já estão intactos. Não é necessário substituí-los pela marca Zapfloo.

## 1. Tornar o REPOSITÓRIO público

1. Abra [Settings do repositório correto](https://github.com/juansanchees/zapfloo-crm/settings).
2. Em **General → Danger Zone → Change repository visibility**, escolha **Public**.
3. Confirme o nome `juansanchees/zapfloo-crm` e os avisos do GitHub.
4. Verifique que a página mostra **Public**. Isso não comprova a visibilidade dos pacotes.

## 2. Tornar os TRÊS PACOTES públicos, um por um

Abra [seus pacotes](https://github.com/juansanchees?tab=packages). Repita **Package settings → Danger Zone → Change visibility → Public** e a confirmação de nome para:

- [ ] `zapfloo-crm`
- [ ] `zapfloo-worker`
- [ ] `zapfloo-scheduler`

Confira a indicação **Public** em cada pacote. Não abra nem apague os antigos nesta etapa. O GitHub avisa que um pacote tornado público não pode voltar a privado. A visibilidade do pacote é independente da abertura do repositório. [Documentação oficial](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## 3. Provar o acesso anônimo com curl

Depois dos quatro cliques de publicação, rode no notebook:

```bash
node /Users/juansanches/Desktop/zapfloo-publicacao-2026-09-10/provar-pull-anonimo.mjs
```

Esse script faz somente GETs por `curl -q`, sem ler login do GitHub, configuração do Docker, cookies ou `.env`. Pede um token **anônimo** de pull ao GHCR e o usa apenas em memória/stdin. Não exibe o token.

**Aceite:** para cada um dos três pacotes, `tokenAnonimo: 200`, `manifestStable: 200` e todos os `manifestsFilhos` com `status: 200`; o processo termina com exit 0. Em particular, o GET anônimo autorizado de `https://ghcr.io/v2/juansanchees/zapfloo-crm/manifests/stable` precisa retornar 200.

O primeiro GET sem bearer pode retornar **401** mesmo num registry público: é o desafio do protocolo. O que prova o acesso é obter o bearer sem credenciais e, com ele, receber **200** no manifest. Não use um PAT pessoal para esta prova: ele mascararia um pacote privado. [GitHub: pull anônimo no Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

**Medição de hoje, antes da abertura:** os três pacotes retornam 401 tanto no GET sem bearer quanto na solicitação de token anônimo. Nenhum 200 pós-abertura foi medido. Enquanto a prova falhar, não declare a instalação de cliente desbloqueada. O teste de manifests é necessário, mas não substitui uma instalação completa em máquina limpa.

## 4. Só depois de você confirmar a abertura: avaliar limpeza

O arquivo `PACOTES.md` é inventário, não autorização para excluir.

1. Conferir na VPS, com leitura filtrada, **somente** `APP_IMAGE`, `WORKER_IMAGE` e `SCHEDULER_IMAGE` do `.env` efetivamente usado pelo compose. Não mostrar/copiar o `.env` inteiro e não executá-lo com `source`.
2. Conferir as imagens dos contêineres em execução, defaults do compose quando uma variável estiver ausente, referências por digest, arquivos de rollback e dependências de outras instalações. O `.env` do notebook não serve como prova.
3. Se qualquer referência ainda usar `deskcommcrm`, `deskcomm-worker` ou `deskcomm-scheduler`, **não excluir**: primeiro é necessária uma migração aprovada e testada. Estar instalado em 07/09 não prova qual imagem está em uso hoje.
4. Só com ausência de dependência comprovada, apresentar para sua decisão a exclusão dos três pacotes antigos, pelos nomes exatos de `PACOTES.md`.
5. Para o worker novo, reconsultar o grafo no momento da limpeza e conferir os **seis digests exatos** listados. Não usar filtro em lote por `untagged`. Verificar também usos diretos por digest e rollback, que tags do registry não revelam.
6. Se você decidir excluir, a exclusão será feita **por você** no painel. Após cada operação, repetir a prova anônima para `stable` e seus filhos. Não fornecer acesso de exclusão a este script: ele não precisa dele.

**Ainda não medido:** `.env` efetivo da VPS, imagens em execução, dependências externas/rollback. Por isso nenhuma exclusão está liberada nesta entrega.
