import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/v1/ai/knowledge/sources/[id]/route";
import { POST as reindex } from "@/app/api/v1/ai/knowledge/sources/[id]/reindex/route";
import { POST as criar } from "@/app/api/v1/ai/knowledge/sources/route";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteFoiRevisado } from "@/lib/onboarding/site/estado";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const ID = "33333333-3333-4333-8333-333333333333";
const params = { params: Promise.resolve({ id: ID }) };
const items = [{ question: "Abre aos sábados?", answer: "Somente pela manhã." }];
let fonte: Record<string, unknown>;
let escritas: Array<{ tabela: string; dados: Record<string, unknown> }>;
let filtros: Array<[string, unknown]>;
let emit: ReturnType<typeof vi.fn>;
let erroItens = false;
let erroLeituraItens = false;
let barreiraLeitura: (() => Promise<void>) | null = null;
function request(body: unknown, method = "PATCH") {
  return new NextRequest("https://app.example/api/v1/ai/knowledge/sources/x", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  erroItens = false;
  erroLeituraItens = false;
  barreiraLeitura = null;
  escritas = [];
  filtros = [];
  emit = vi.fn().mockResolvedValue({ error: null });
  fonte = {
    id: ID,
    source_type: "site",
    agent_id: null,
    status: "ready",
    is_active: false,
    source_metadata: {
      site: { url: "https://loja.example/", concluidaEm: "2026-09-12T10:00:00.000Z" },
    },
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER, idioma: "pt-BR" },
    org: { orgId: ORG, role: "manager" },
  } as never);
  const leitura = {
    select: () => leitura,
    eq: (k: string, v: unknown) => {
      filtros.push([k, v]);
      return leitura;
    },
    maybeSingle: async () => {
      const snapshot = structuredClone(fonte);
      await barreiraLeitura?.();
      return { data: snapshot, error: null };
    },
    order: async () => ({
      data: erroLeituraItens ? null : items,
      error: erroLeituraItens ? { message: "fixture: leitura indisponível" } : null,
    }),
  };
  vi.mocked(createClient).mockResolvedValue({ from: () => leitura } as never);
  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => {
      let dados: Record<string, unknown> | undefined;
      const predicados: Array<[string, unknown]> = [];
      const executar = async () => {
        const casOk =
          tabela !== "ai_knowledge_sources" ||
          predicados.every(([k, v]) =>
            k === "source_metadata"
              ? JSON.stringify(fonte.source_metadata) === v
              : k === "status"
                ? fonte.status === v
                : true,
          );
        if (!casOk) return { data: null, error: null };
        if (dados) {
          escritas.push({ tabela, dados });
          if (tabela === "ai_knowledge_sources") Object.assign(fonte, dados);
        }
        return {
          data: { id: ID },
          error: tabela === "ai_faq_items" && erroItens ? { message: "fixture" } : null,
        };
      };
      const chain = {
        update: (valor: Record<string, unknown>) => {
          dados = valor;
          return chain;
        },
        delete: () => chain,
        insert: (valor: Record<string, unknown>) => {
          dados = valor;
          return chain;
        },
        eq: (k: string, v: unknown) => {
          filtros.push([k, v]);
          predicados.push([k, v]);
          return chain;
        },
        select: () => chain,
        maybeSingle: executar,
        then: (resolve: (v: unknown) => unknown) => executar().then(resolve),
      };
      return chain;
    },
    rpc: emit,
  } as never);
});

describe("material do site só vira conhecimento após conferência", () => {
  it("GET recusa erro ao carregar FAQ, nunca devolve um vazio que pode sobrescrever o material", async () => {
    erroLeituraItens = true;
    const res = await GET(new NextRequest("https://app.example/api/v1/ai/knowledge/sources/x"), params);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "internal_error", message: "Erro ao ler o material." } });
    expect(body).not.toHaveProperty("data");
    expect(escritas).toEqual([]);
  });
  it("GET devolve as perguntas existentes quando a leitura funciona", async () => {
    const res = await GET(new NextRequest("https://app.example/api/v1/ai/knowledge/sources/x"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { id: ID, items } });
  });
  it("cadastro genérico não fabrica uma fonte site ativa", async () => {
    const res = await criar(request({ name: "Site", source_type: "site", items }, "POST"));
    expect(res.status).toBe(422);
    expect(escritas).toEqual([]);
  });
  it("reindexar rascunho recusa sem emitir nem apagar erro", async () => {
    const res = await reindex(request({}, "POST"), params);
    expect(res.status).toBe(409);
    expect(emit).not.toHaveBeenCalled();
    expect(escritas).toEqual([]);
  });
  it("PATCH não aceita carimbo de revisão forjado pelo metadata", async () => {
    const res = await PATCH(
      request({ source_metadata: { site: { revisadoEm: new Date().toISOString() } } }),
      params,
    );
    expect(res.status).toBe(422);
    expect(escritas).toEqual([]);
  });
  it("salvar sem confirmar preserva inativo; confirmar exige itens e destrava reindex", async () => {
    expect((await PATCH(request({ confirmar_site: true }), params)).status).toBe(422);
    expect((await PATCH(request({ items }), params)).status).toBe(200);
    expect(fonte.is_active).toBe(false);
    expect(siteFoiRevisado(fonte.source_metadata)).toBe(false);
    expect((await PATCH(request({ items, confirmar_site: true }), params)).status).toBe(200);
    expect(fonte.is_active).toBe(true);
    expect(siteFoiRevisado(fonte.source_metadata)).toBe(true);
    expect((await reindex(request({}, "POST"), params)).status).toBe(200);
    expect(filtros.filter(([k]) => k === "organization_id").every(([, v]) => v === ORG)).toBe(true);
    expect(escritas.filter((w) => w.tabela === "ai_faq_items")[0]?.dados).toMatchObject([
      { organization_id: ORG, knowledge_source_id: ID },
    ]);
  });
  it("não confirma durante leitura e falha de escrita deixa o agente sem usar conteúdo parcial", async () => {
    fonte.status = "building";
    expect((await PATCH(request({ items, confirmar_site: true }), params)).status).toBe(409);
    fonte.status = "ready";
    fonte.is_active = true;
    erroItens = true;
    expect((await PATCH(request({ items, confirmar_site: true }), params)).status).toBe(500);
    expect(fonte.is_active).toBe(false);
  });
  it("duas abas com o mesmo snapshot não misturam os textos nem herdam a aprovação", async () => {
    let liberar!: () => void;
    const ambasLeram = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    let leituras = 0;
    barreiraLeitura = async () => {
      if (++leituras === 2) liberar();
      await ambasLeram;
    };
    const respostas = await Promise.all([
      PATCH(request({ items, confirmar_site: true }), params),
      PATCH(
        request({
          items: [{ question: "Quando abre?", answer: "Texto da outra aba, não conferido." }],
        }),
        params,
      ),
    ]);
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(escritas.filter((w) => w.tabela === "ai_faq_items")).toHaveLength(1);
    expect(fonte.is_active).toBe(true);
    expect(siteFoiRevisado(fonte.source_metadata)).toBe(true);
  });
  it("revisão interrompida permite retomar após o lease, sem publicar por inércia", async () => {
    fonte.status = "building";
    const site = (fonte.source_metadata as { site: Record<string, unknown> }).site;
    site.revisaoToken = "55555555-5555-4555-8555-555555555555";
    site.revisaoInicio = new Date(Date.now() - 121_000).toISOString();
    expect((await PATCH(request({ items }), params)).status).toBe(200);
    expect(fonte.is_active).toBe(false);
    expect(fonte.status).toBe("ready");
  });
});
