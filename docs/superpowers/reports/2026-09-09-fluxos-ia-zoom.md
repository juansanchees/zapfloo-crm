# Fluxos: diagnóstico e correções locais

## Comprovado

- O print da geração corresponde ao ramo `ai_credential_error`: o normalizador
  classifica 401/403 e erros de autenticação como credencial recusada. Isso não
  identifica sozinho se a chave foi revogada, é de outro provedor ou não tem
  permissão. A configuração da VPS não foi lida ou alterada.
- O hook usava o timeout padrão de 10s, mas o modelo aceita 35s e a rota 45s.
  Um teste com resposta em 12s reproduziu dois POSTs; uma resposta 503 reproduziu
  três POSTs. A geração agora usa timeout de 50s e `retry: false`. Os demais
  consumidores do cliente HTTP mantêm seu comportamento anterior.
- O CSS padrão do React Flow combinava fundo quase branco e cor herdada do tema
  escuro. Playwright reproduziu contraste de 1,10:1. A correção usa os tokens de
  superfície/texto do produto pelas variáveis CSS da biblioteca, escopadas no
  módulo do canvas. Controles ficam à direita, separados do botão móvel.
- A recusa da chave agora oferece links para revisar chaves e modelos em outra
  aba, sem limpar nome ou descrição. Nenhuma chave ou prompt entra nos logs.

## Verificação

- RED: três regressões de geração/UI falharam antes das correções; E2E de
  contraste falhou em 1,10:1 antes da correção de CSS.
- GREEN: 26 testes focados passaram (hook real com transporte controlado,
  diálogo, cliente HTTP, parser/validador do rascunho, rota e cobertura do CI).
- Build local de produção `pnpm e2e:build`: exit 0.
- E2E `fluxo-controles-contraste.spec.ts`: passou em temas claro/escuro e
  larguras 1440/390. Mede contraste >=4,5:1 das cores dos controles, verifica
  zoom com mudança de viewport, enquadramento e ausência de sobreposição móvel.
  A recusa de credencial é simulada no transporte, não uma chamada real de IA.
- Capturas sem dados de clientes: `.superpowers/evidence/fluxo-controles/`.
- Não houve mudança de schema, permissões, publicação ou push.

## Pendências

Restabelecer acesso autorizado à VPS, verificar provedor/modelo/estado da chave
sem expor segredos, publicar e provar a geração real de um rascunho. Não afirmar
que o erro de credencial real foi resolvido por estas correções de transporte/UX.

Referência da integração visual: [React Flow — Theming](https://reactflow.dev/learn/customization/theming).
