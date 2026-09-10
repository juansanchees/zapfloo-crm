/**
 * O passo do telefone PERGUNTA antes de assumir o código no celular.
 *
 * ─── O defeito que este teste guarda ────────────────────────────────────────
 *
 * O produto conecta um número de três formas — código lido no celular, conta
 * oficial na Meta, e provedor parceiro —, e a tela de Conexões oferece as três.
 * O wizard oferecia UMA, e nem isso: ele não perguntava. A tela montava e o
 * primeiro efeito já disparava `POST /api/v1/onboarding/whatsapp/session`, que
 * grava a linha do canal sem informar a coluna do provedor — e ela nasce com o
 * default do transporte por código. Quem tinha conta oficial já estava no
 * caminho errado antes de clicar em coisa nenhuma, e só descobria depois, em
 * outra tela, com o funcionário já montado por cima.
 *
 * O teste cobra as DUAS metades, porque uma sem a outra não conserta nada:
 *   1. a pergunta aparece, com as três formas; e
 *   2. nada é criado enquanto ela não é respondida.
 *
 * A segunda é a que tem dente. Uma tela que pergunta e cria o canal mesmo assim
 * seria o controle decorativo que este repo já pagou caro (PR #295): a tela
 * oferece e o motor ignora.
 *
 * ─── E a metade que NÃO se vê ───────────────────────────────────────────────
 *
 * A escolha não pode ser gravada. `cumprido` do passo é `Boolean(state.whatsapp)`
 * (`lib/onboarding/passos.ts`), então persistir no clique marcaria o passo como
 * resolvido: quem fechasse o navegador cairia no passo seguinte sem telefone e
 * sem volta, porque o roteador só devolve o primeiro passo NÃO cumprido. O caso
 * "voltar para a pergunta" abaixo é o que guarda isso pela porta da frente —
 * se a escolha virasse estado gravado, ela não teria como voltar a ser nula.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/app/actions/onboarding/skipWhatsapp", () => ({
  skipWhatsapp: vi.fn(),
  markWhatsappConfigured: vi.fn(),
}));

/**
 * Os dois clientes de canal por credencial são substituídos por marcadores.
 * O que está sob teste é a BIFURCAÇÃO — que a escolha leve ao lugar certo —,
 * não o formulário deles, que tem dono e teste próprios em Conexões. Montá-los
 * de verdade traria `useQuery` e as rotas junto, e o teste passaria a falhar
 * por motivo alheio ao que ele afirma.
 */
vi.mock("@/components/connections/CanalOficialClient", () => ({
  CanalOficialClient: () => <div data-testid="dublê-oficial" />,
}));
vi.mock("@/components/connections/CanalParceiroClient", () => ({
  CanalParceiroClient: () => <div data-testid="dublê-parceiro" />,
}));

import {
  ConnectWhatsappClient,
  relancarInterrupcaoDoNext,
} from "@/app/onboarding/connect-whatsapp/_client";
import { markWhatsappConfigured } from "@/app/actions/onboarding/skipWhatsapp";

/** Toda chamada de rede que a tela tentar fazer passa por aqui. */
let chamadas: string[] = [];

beforeEach(() => {
  chamadas = [];
  vi.mocked(markWhatsappConfigured).mockReset();
  vi.mocked(markWhatsappConfigured).mockResolvedValue(undefined as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { method?: string }) => {
      chamadas.push(`${init?.method ?? "GET"} ${String(url)}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { status: "SCAN_QR_CODE", session: "org_teste" } }),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function montar(props?: { oficialPodeReceber?: boolean }) {
  return render(
    <ConnectWhatsappClient
      wahaConfigured
      sessionName="org_teste"
      oficialPodeReceber={props?.oficialPodeReceber ?? true}
      canaisIniciais={[]}
    />,
  );
}

/** As chamadas que CRIAM ou consultam a sessão do canal por código. */
function chamadasDeSessao(): string[] {
  return chamadas.filter((c) => c.includes("/onboarding/whatsapp/session"));
}

describe("o passo do telefone pergunta como a pessoa já usa o número", () => {
  it("não transforma o redirect de sucesso da Server Action em erro de confirmação", () => {
    const redirect = new Error("NEXT_REDIRECT");
    (redirect as Error & { digest: string }).digest =
      "NEXT_REDIRECT;replace;/onboarding;303;";

    expect(() => relancarInterrupcaoDoNext(redirect)).toThrow(redirect);
    expect(() => relancarInterrupcaoDoNext(new Error("falha de rede"))).not.toThrow();
  });

  it("QR WORKING confirma a conexão no servidor uma única vez sem ativar IA", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { status: "WORKING", session: "org_teste", channel_session_id: "11111111-1111-4111-8111-111111111111" } }) } as Response);
    montar();
    fireEvent.click(screen.getByTestId("forma-qr").querySelector("input")!);
    await screen.findByText("Conexão pronta. Você já pode abrir as conversas para atender manualmente. A IA continua com a política atual do canal.");
    await waitFor(() => expect(markWhatsappConfigured).toHaveBeenCalledOnce());
    expect(markWhatsappConfigured).toHaveBeenCalledWith({
      channel_session_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(screen.queryByRole("button", { name: "Conectei em outro lugar" })).toBeNull();
  });

  it("preserva o UUID do POST quando o polling GET chega WORKING sem repeti-lo", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            status: "SCAN_QR_CODE",
            session: "org_teste",
            channel_session_id: "22222222-2222-4222-8222-222222222222",
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { status: "WORKING", session: "org_teste" } }),
      } as Response);

    montar();
    fireEvent.click(screen.getByTestId("forma-qr").querySelector("input")!);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });

    expect(markWhatsappConfigured).toHaveBeenCalledOnce();
    expect(markWhatsappConfigured).toHaveBeenCalledWith({
      channel_session_id: "22222222-2222-4222-8222-222222222222",
    });
    vi.useRealTimers();
  });

  it("falha de confirmação interrompe o avanço automático e oferece tentativa manual", async () => {
    vi.mocked(markWhatsappConfigured).mockResolvedValue({ ok: false, error: "upstream_unavailable" });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: "WORKING",
          session: "org_teste",
          channel_session_id: "33333333-3333-4333-8333-333333333333",
        },
      }),
    } as Response);

    montar();
    fireEvent.click(screen.getByTestId("forma-qr").querySelector("input")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível confirmar/i);
    expect(markWhatsappConfigured).toHaveBeenCalledOnce();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(markWhatsappConfigured).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /tentar confirmar novamente/i }));
    await waitFor(() => expect(markWhatsappConfigured).toHaveBeenCalledTimes(2));
  });

  it("Conferir canais consulta a lista autenticada e confirma o único canal pelo mesmo escritor", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{
          id: "44444444-4444-4444-8444-444444444444",
          display_name: "Vendas",
          phone_number: "+5511999999999",
          status: "STARTING",
        }],
      }),
    } as Response);
    montar();

    fireEvent.click(screen.getByRole("button", { name: /conferir canais conectados/i }));

    await waitFor(() => expect(markWhatsappConfigured).toHaveBeenCalledWith({
      channel_session_id: "44444444-4444-4444-8444-444444444444",
    }));
    expect(fetch).toHaveBeenCalledWith("/api/v1/channel-sessions");
  });

  it("com mais de um canal inicia vazio e não confirma antes da escolha explícita", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [
        { id: "55555555-5555-4555-8555-555555555555", display_name: "Suporte", status: "STARTING" },
        { id: "66666666-6666-4666-8666-666666666666", display_name: "Vendas", status: "WORKING" },
      ] }),
    } as Response);
    montar();

    fireEvent.click(screen.getByRole("button", { name: /conferir canais conectados/i }));
    const seletor = await screen.findByLabelText("Canal conectado");
    const confirmar = screen.getByRole("button", { name: "Confirmar este canal" });
    expect(seletor).toHaveValue("");
    expect(screen.getByRole("option", { name: "Selecione um canal" })).toBeDisabled();
    expect(confirmar).toBeDisabled();
    fireEvent.click(confirmar);
    expect(markWhatsappConfigured).not.toHaveBeenCalled();

    fireEvent.change(seletor, { target: { value: "66666666-6666-4666-8666-666666666666" } });
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);

    await waitFor(() => expect(markWhatsappConfigured).toHaveBeenCalledWith({
      channel_session_id: "66666666-6666-4666-8666-666666666666",
    }));
  });
  it("abre com a pergunta e as três formas, não com o código", () => {
    montar();

    expect(screen.getByText(/como você já usa esse número/i)).toBeTruthy();
    expect(screen.getByTestId("forma-qr")).toBeTruthy();
    expect(screen.getByTestId("forma-oficial")).toBeTruthy();
    expect(screen.getByTestId("forma-parceiro")).toBeTruthy();

    // O código não pode estar na tela antes de alguém escolher lê-lo.
    expect(screen.queryByAltText(/código qr/i)).toBeNull();
  });

  it("NÃO cria a sessão do canal enquanto ninguém escolheu", () => {
    montar();

    // É este o defeito: o canal nascia só por a pessoa pisar na rota.
    expect(chamadasDeSessao()).toEqual([]);
  });

  it("escolher o código no celular é o que sobe a sessão", async () => {
    montar();
    expect(chamadasDeSessao()).toEqual([]);

    fireEvent.click(screen.getByTestId("forma-qr").querySelector("input")!);

    await waitFor(() => {
      expect(chamadasDeSessao().some((c) => c.startsWith("POST"))).toBe(true);
    });
  });

  it("escolher conta oficial leva ao canal oficial, e NÃO cria sessão de código", async () => {
    montar();

    fireEvent.click(screen.getByTestId("forma-oficial").querySelector("input")!);

    await waitFor(() => expect(screen.getByTestId("dublê-oficial")).toBeTruthy());
    expect(screen.queryByTestId("dublê-parceiro")).toBeNull();
    // O ponto todo: escolher outra forma não pode deixar um canal por código
    // pendurado, nem seguir consultando o transporte por trás do formulário.
    expect(chamadasDeSessao()).toEqual([]);
  });

  it("escolher provedor parceiro leva ao canal do parceiro", async () => {
    montar();

    fireEvent.click(screen.getByTestId("forma-parceiro").querySelector("input")!);

    await waitFor(() => expect(screen.getByTestId("dublê-parceiro")).toBeTruthy());
    expect(screen.queryByTestId("dublê-oficial")).toBeNull();
    expect(chamadasDeSessao()).toEqual([]);
  });

  it("dá para voltar e trocar de forma — escolher não tranca a porta", async () => {
    montar();

    fireEvent.click(screen.getByTestId("forma-oficial").querySelector("input")!);
    await waitFor(() => expect(screen.getByTestId("dublê-oficial")).toBeTruthy());

    fireEvent.click(screen.getByTestId("voltar-para-escolha"));

    // A pergunta volta inteira. Se a escolha fosse gravada em vez de viver em
    // memória, não haveria como desfazê-la — e o passo já estaria "cumprido".
    await waitFor(() => expect(screen.getByText(/como você já usa esse número/i)).toBeTruthy());
    expect(screen.getByTestId("forma-qr")).toBeTruthy();
  });

  it("a confirmação existe já na pergunta — nenhum estado é beco", () => {
    montar();

    expect(screen.getByRole("button", { name: /conferir canais conectados/i })).toBeTruthy();
  });

  it("avisa que o servidor ainda não recebe pelo caminho oficial, ANTES do formulário", async () => {
    montar({ oficialPodeReceber: false });

    fireEvent.click(screen.getByTestId("forma-oficial").querySelector("input")!);

    // O `install.sh` não escreve o valor de que a volta depende: numa instalação
    // recém-feita este é o estado NORMAL, e a hora de dizer isso é antes de a
    // pessoa ir buscar três credenciais no painel — não depois de conectar.
    await waitFor(() =>
      expect(screen.getByText(/ainda não está pronto para RECEBER/i)).toBeTruthy(),
    );
  });

  it("com o servidor pronto, o aviso não aparece", async () => {
    montar({ oficialPodeReceber: true });

    fireEvent.click(screen.getByTestId("forma-oficial").querySelector("input")!);

    await waitFor(() => expect(screen.getByTestId("dublê-oficial")).toBeTruthy());
    expect(screen.queryByText(/ainda não está pronto para RECEBER/i)).toBeNull();
  });
});
