# Inventário do GHCR — NÃO liberado para exclusão

Medição de 10/09/2026. Consultadas todas as páginas de versões dos seis pacotes e seus manifests, recursivamente. Protegidos todos os índices/manifests alcançáveis a partir de qualquer tag, incluindo referências `subject` de artefatos. Nenhum pacote foi alterado.

## Três pacotes antigos a reavaliar somente após abertura e conferência da VPS

| Nome exato no namespace `juansanchees` | Versões | Blobs únicos comprimidos | MiB aproximados |
|---|---:|---:|---:|
| `deskcommcrm` — sem hífen entre deskcomm e crm | 3 | 153.206.383 bytes | 146,11 |
| `deskcomm-worker` | 3 | 435.527.613 bytes | 415,35 |
| `deskcomm-scheduler` | 3 | 6.411.945 bytes | 6,11 |
| Soma por pacote | 9 | 595.145.941 bytes | 567,58 |

Isso corresponde aos cerca de “568 MB” do briefing, usando MiB. Não é uma promessa de economia faturada: deduplicação entre pacotes, manifest metadata, política de coleta e contabilização do GitHub não foram medidas. Os três ainda têm `latest`/`main`; portanto “antigo” NÃO comprova “sem consumidor”.

**Bloqueio:** ainda não conferidos `APP_IMAGE`, `WORKER_IMAGE`, `SCHEDULER_IMAGE` do `.env` efetivo, contêineres rodando, dependências externas e rollback. Nenhuma exclusão será proposta como segura antes disso e da confirmação do dono de que abriu o repositório/pacotes.

## Worker novo: seis digests sem caminho a partir de tags

Pacote: `juansanchees/zapfloo-worker`. São dois componentes de três manifests cada. Os manifests internos dependem entre si, mas nenhum deles é alcançado por uma tag atual. Ausência de tag NÃO prova ausência de consumo direto por digest.

| Versão GitHub | Digest exato | Papel no componente |
|---|---|---|
| 1221339175 | `sha256:6137a5a109834582776d31d3e65cc8d186fc738b59afdd026eb18540ff72239a` | Índice sem tag; referencia os dois abaixo |
| 1221339158 | `sha256:08df76cf6c5062a4c0b9d853a1d57eaf79670320fbce776dda3feb3f087e5d3b` | Manifest filho; também referencia o próximo via subject |
| 1221339148 | `sha256:be9e1f5d9250fa899d25b4d5bdf1db9103469bf111ca5c291f3f317f7fec36fa` | Manifest filho |
| 1221282209 | `sha256:2c721d0f6f953beef420d1e64377e07ea302c49397f64d1dc9c21f096c046158` | Índice sem tag; referencia os dois abaixo |
| 1221282198 | `sha256:94437f310ce57969cd3f5a1c2f14da048372d3d3ec8e17febbbc8004f1dfdfe2` | Manifest filho; também referencia o próximo via subject |
| 1221282190 | `sha256:02ffeebda4d0ad09239bba70b0074737b848fb3492c2f74afb07cad0bcc2429e` | Manifest filho |

Estimativa restrita ao worker: 755.571.335 bytes de blobs exclusivos desses componentes, descontados os blobs dos manifests protegidos desse mesmo pacote. Isso não equivale necessariamente a bytes de cobrança liberados.

Antes de qualquer exclusão pelo dono: reconsultar os digests/IDs, percorrer novamente as referências e confirmar que nenhum deploy ou rollback usa os digests diretamente. Nunca selecionar todas as versões “untagged”.

## O que preservar

- `zapfloo-crm`: 6 versões; as 4 sem tag estão todas protegidas por referências dos índices com tag. **Zero candidata órfã.**
- `zapfloo-worker`: preservar os 2 índices com tag e seus 4 manifests dependentes.
- `stable` do CRM: `sha256:4c70784ab2b626e23d9c59e830e5b7cbde8516d73c9799e21dad7eef15bb3c4a`.
- `stable` do worker: `sha256:3cc3399a89751eb76d6e7114ccc3c5a7483bc375df302c60b736eea76be82c53`.
- `stable` do scheduler: `sha256:f1d1f7bddc2c4537769f496529c7d67d848f604b369e1aa0b825cd6d7368ea8e`.

O inventário também encontrou seis versões do `zapfloo-scheduler` sem caminho a partir de tags. Estão registradas no JSON, mas **não foram incluídas no plano solicitado de exclusão**. Não ampliar a limpeza automaticamente.

Fonte de medição: `registry-inventory.json`, que contém todos os IDs, digests, tags, dependências e tamanhos de blobs (sem tokens). O script `registry-audit.mjs` faz somente leitura; não contém chamadas DELETE ou mudanças de visibilidade.
