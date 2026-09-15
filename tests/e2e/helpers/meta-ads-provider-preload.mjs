// Transporte externo exclusivo da prova OAuth. O produto não importa este
// módulo: só o Next isolado do Playwright o recebe por `node --import`.
// Auth, autorização, state, cookies, cifra e consumo dos links continuam reais.
if (process.env.E2E_META_ADS_FIXTURE !== "1") throw new Error("Preload exclusivo do OAuth local.");
if (process.env.META_APP_ID !== "123456789012345"
  || process.env.META_APP_SECRET !== "meta-ads-oauth-local-fixture-only"
  || process.env.META_LOGIN_CONFIG_ID !== "987654321098765") {
  throw new Error("Preload exige configuração OAuth sintética.");
}
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)) {
  throw new Error("Preload exige banco local.");
}
if (!process.argv.some(arg => arg.includes("next/dist/bin/next")) || !process.argv.includes("start")) {
  throw new Error("Preload exige processo Next de teste.");
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "graph.facebook.com") {
    const local = `http://127.0.0.1:54382${url.pathname}${url.search}`;
    return originalFetch(typeof input === "object" && !(input instanceof URL) ? new Request(local, input) : local, init);
  }
  // Consentimento é interceptado no navegador. Nenhuma chamada Meta real pode
  // escapar pelo processo Node se a implementação mudar o host do transporte.
  if (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com")) {
    throw new Error("A prova OAuth proíbe acesso à Meta real.");
  }
  return originalFetch(input, init);
};
