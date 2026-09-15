// Proxy TLS exclusivo do harness: mantém next start em production, a exigência
// HTTPS do produto e o comportamento real dos cookies Secure/SameSite.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:https";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.E2E_LOCAL_HTTPS !== "1" || process.env.E2E_META_ADS_FIXTURE !== "1") {
  throw new Error("Proxy TLS exclusivo do OAuth sintético local.");
}
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)
  || process.env.NEXT_PUBLIC_APP_URL !== "https://localhost:3443") {
  throw new Error("Proxy TLS exige app e banco locais.");
}
const port = Number(process.env.E2E_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3443 || port === 54382) {
  throw new Error("Porta Next inválida para a prova OAuth local.");
}

const diretorio = resolve(".superpowers/evidence/meta-ads-oauth/tls");
const key = resolve(diretorio, "key.pem"), cert = resolve(diretorio, "cert.pem");
if (existsSync(key) !== existsSync(cert)) throw new Error("Par TLS local incompleto.");
if (!existsSync(key)) {
  mkdirSync(diretorio, { recursive: true });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", key, "-out", cert], { stdio: "ignore" });
}

const app = spawn(process.execPath, [
  "--import", pathToFileURL(resolve("tests/e2e/helpers/meta-ads-provider-preload.mjs")).href,
  "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port),
], { stdio: "inherit", env: process.env });

const proxy = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
  const upstream = request({ hostname: "127.0.0.1", port, path: req.url, method: req.method,
    headers: { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-host": "localhost:3443" },
  }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("Next local ainda indisponível.");
  });
  req.pipe(upstream);
});

let encerrando = false;
function encerrar(code) {
  if (encerrando) return;
  encerrando = true;
  app.kill("SIGTERM");
  proxy.closeAllConnections();
  proxy.close(() => process.exit(code));
}
app.once("error", () => encerrar(1));
app.once("exit", code => { if (!encerrando) encerrar(code ?? 1); });
proxy.once("error", () => encerrar(1));
process.once("SIGINT", () => encerrar(0));
process.once("SIGTERM", () => encerrar(0));
proxy.listen(3443, "127.0.0.1");
