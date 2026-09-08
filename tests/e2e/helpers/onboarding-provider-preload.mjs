// Somente harness: carregado explicitamente por node --import no Next do teste sintético.
// Nenhum módulo de produção importa este arquivo; nenhuma API de IA real é acessada.
if (process.env.E2E_ONBOARDING_SYNTHETIC_PROVIDER !== "1") throw new Error("Preload exclusivo do ensaio sintético local.");
if (process.env.OPENAI_API_KEY !== "onboarding-local-provider-only") throw new Error("Preload exige chave sintética.");
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)) throw new Error("Preload exige banco local.");
if (!process.argv.some(arg => arg.includes("next/dist/bin/next")) || !process.argv.includes("start")) throw new Error("Preload exige processo Next de teste.");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.openai.com") {
    return originalFetch(`http://127.0.0.1:54380${url.pathname}`, init);
  }
  if (["api.anthropic.com", "openrouter.ai", "generativelanguage.googleapis.com"].includes(url.hostname)) {
    throw new Error("O ensaio sintético proíbe provedores reais.");
  }
  return originalFetch(input, init);
};
