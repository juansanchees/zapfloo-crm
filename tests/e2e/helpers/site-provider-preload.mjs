// Transporte sintético EXCLUSIVO do harness: o leitor, guards, actions e banco
// continuam reais. Somente DNS/TLS públicos não são provados por esta fixture.
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (process.env.E2E_ONBOARDING_SITE_FIXTURE !== "1") throw new Error("Preload exclusivo da leitura de site local.");
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)) throw new Error("Preload exige banco local.");
if (!process.argv.some(arg => arg.includes("next/dist/bin/next")) || !process.argv.includes("start")) throw new Error("Preload exige processo Next de teste.");

const sufixo = ".onboarding-site.test";
const originalLookup = dns.lookup;
dns.lookup = async (hostname, options) => {
  if (!hostname.endsWith(sufixo)) return originalLookup(hostname, options);
  const address = hostname.startsWith("interno.") ? "127.0.0.1" : "93.184.216.34";
  const result = { address, family: 4 };
  return options?.all ? [result] : result;
};
syncBuiltinESMExports();

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!url.hostname.endsWith(sufixo)) return originalFetch(input, init);
  const local = `http://127.0.0.1:54381/${url.hostname}${url.pathname}${url.search}`;
  // Não fabricar Response: o receiver HTTP recebe de verdade. O AbortSignal
  // também segue até a conexão, para que timeout e leitura lenta sejam reais.
  return originalFetch(typeof input === "object" && !(input instanceof URL) ? new Request(local, input) : local, init);
};
