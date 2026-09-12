# Zapfloo — publicação privada sem Actions pago

Status: procedimento em preparação em 2026-09-08; **não é evidência de publicação executada**. A instalação atual continua intacta até os gates e a checagem de recuperação.

## Escopo da exceção

O usuário autorizou manter o código localmente e não contratar GitHub pago. A distribuição normal descrita em `docs/doctrine/packaging.md` continua sendo uma release produzida pelo CI. Este procedimento é uma exceção explícita para a instalação própria da Zapfloo, não uma release oficial do upstream nem justificativa para checks vermelhos.

Não exige tornar o repositório público, alterar cobrança, enviar código ao GitHub ou publicar imagens em um registry. Não inclui atualização do WAHA, Redis ou proxy. Não inclui mensagens de teste para contatos reais.

## Portas de saída obrigatórias

1. SHA candidato local identificado; árvore sem mudanças de produto não incorporadas. Guardar logs completos com comando, início/fim e exit code.
2. Conforme redução de escopo autorizada pelo usuário: aproveitar typecheck/lint e testes focados, invariantes DB relevantes (baseline install/update), build e E2E essenciais de login/organização e ativação restrita. Bateria global adiada, não declarada verde. Evidências visuais sintéticas; enumerar casos não executados, não tratá-los como aprovados.
3. Três imagens próprias `app`, `worker`, `scheduler` produzidas para `linux/amd64`, com o mesmo SHA/version label. Não redistribuir imagem upstream WAHA.
4. Estado real da VPS confirmado: diretório/compose/proxy, imagens em execução, espaço livre, saúde e versão do banco externo. Não copiar o caminho de exemplo do runbook upstream como se fosse o caminho desta VPS.
5. Recuperação antes de mutações: guardar imagens/configurações anteriores sem revelar segredos; ter backup/restauração de banco disponível e compatibilidade do código anterior com migrations aditivas. O backup externo do código que o usuário fará depois não substitui esta proteção operacional.
6. Só publicar depois das condições anteriores; não iniciar update se SSH, banco correto ou recuperação estiverem indisponíveis.

## Artefato local e isolamento de segredos

Exportar o SHA validado com `git archive` para um diretório temporário dedicado. Isso exclui `.env` não versionado, `node_modules`, relatórios privados e diretórios de trabalho ignorados; conferir a lista exportada antes do build. `.dockerignore` continua sendo a segunda barreira. Não construir a partir de uma pasta arbitrária com arquivos locais de cliente.

Usar tag local derivada do SHA, não `latest`/`stable` e não inventar uma release semver. Registrar:

- SHA integral e branch de origem;
- referências e IDs/digests das três imagens;
- arquitetura confirmada por `docker image inspect` com campos selecionados;
- labels OCI de source, revision, version e licença;
- checksum SHA-256 do arquivo de transporte e logs do build;
- diferenças de schema exigidas e resultado dos testes.

O Docker do Mac instalado não expõe `buildx`, mas o Docker da VM Colima já tem esse comando. Em 2026-09-08, `colima ssh -- docker buildx ls` confirmou suporte a `linux/amd64` e `linux/arm64`. A build deve selecionar `--platform linux/amd64 --load` explicitamente; não assumir que uma imagem ARM do Mac serve à VPS. O arquivo de transporte pode ser gerado por `docker image save` e importado por `docker image load`, sem registry. A documentação oficial descreve o [exportador Docker e o carregamento local](https://docs.docker.com/build/exporters/).

Contingência usada nesta execução: o app esgotou a memória em emulação. Sua imagem é construída nativamente na VPS a partir do mesmo `git archive` sem segredos, com limites explícitos de CPU/RAM/swap, sem alterar serviços ativos. Continua sendo exceção para esta instalação própria, não publicação oficial de upstream. Worker/agendador mantêm os artefatos amd64 construídos localmente. Registrar separadamente o resultado de cada build; não esconder a falha anterior.

## Aplicação na VPS

Transportar somente artefatos com checksum conferido. Criar um override dedicado, sem segredos, que fixe as três referências locais e `pull_policy: never`. Não editar `.env` para trocar imagens. Guardar a configuração anterior e usar o compose/proxy realmente encontrados na instalação; se for Traefik, preservar obrigatoriamente os dois arquivos descritos em `docs/runbooks/deploy.md`, além do override.

Não executar `down -v`, pruning, remoção de imagens antigas ou baseline indiscriminado. Aplicar somente as migrations pendentes, revisadas contra o projeto externo correto, depois da proteção de recuperação. Interromper se houver drift, dependência ausente ou DDL destrutivo não previsto.

Recriar somente os três serviços próprios; não recriar WAHA/Redis/proxy como efeito colateral. Um `up` futuro sem o override pode trocar as imagens: o comando operacional final e os caminhos confirmados devem ficar registrados na VPS e neste relatório de execução.

## Validação e rollback

- Confirmar IDs das três imagens e saúde dos serviços; `healthy` sozinho não prova roteamento.
- Confirmar HTTPS, redirecionamento/login, assets, navegação autenticada e estado de organização existente sem alterações.
- Confirmar transporte conectado somente em leitura. Não enviar WhatsApp nem liberar público para provar deploy.
- Confirmar novo onboarding usando dados sintéticos em ambiente isolado; não criar dados fictícios numa organização real silenciosamente.
- Em regressão, restaurar referências das imagens/configuração anterior e recriar apenas os serviços próprios, preservando proxy e volumes. Schema aditivo permanece, se compatível; não fazer rollback apagando rascunhos, agentes ou canais.
- Se rollback exigir restaurar dados e perder gravações posteriores, parar e pedir decisão: não executar restauração destrutiva automaticamente.

## Pré-checagem atual, ainda não liberatória

Em 2026-09-08, `/login` respondeu HTTPS200. O HTML público aponta o Supabase `oedsleckaokqxpzpgwvz`; a conexão MCP disponível lista apenas `jmuxxanlafkrewwkakkb`. **Não usar o projeto antigo** para aplicar as migrations desta instalação. SSH nas portas conhecidas22/2222 não respondeu nesta checagem. O painel Hostinger continua acessível e mostra a VPS ativa. Nada foi alterado na hospedagem ou no banco remoto.

O probe público `/api/v1/health` às21:41:36Z reportou versão1.17.0 e `healthy` (Supabase/Redis/WAHA `ok`). Isso confirma conectividade naquele instante, não prova schema compatível ou navegação autenticada. Uma nova tentativa SSH2222 também terminou em timeout; não há configuração SSH local indicando outra porta conhecida.
