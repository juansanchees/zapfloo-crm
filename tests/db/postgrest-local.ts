/** PostgREST real sobre o banco descartável de test:db; nunca usa env de produção. */
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PostgrestLocal {
  url: string;
  cliente(role: "authenticated" | "service_role", userId?: string): SupabaseClient;
  encerrar(): Promise<void>;
}

export async function subirPostgrestLocal(): Promise<PostgrestLocal> {
  const banco = process.env.TEST_DB_CONTAINER;
  if (!banco || !/^deskcomm-test-db-\d+$/.test(banco)) {
    throw new Error("PostgREST de teste exige o container descartável de scripts/test-db.sh.");
  }
  const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8" }).trim();
  const ip = docker(["inspect", "--format", "{{.NetworkSettings.Networks.bridge.IPAddress}}", banco]);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new Error("Banco de teste sem IP na bridge Docker.");
  const nome = `zapfloo-test-postgrest-${randomUUID()}`;
  const segredo = randomBytes(32).toString("hex");
  const encerrar = async () => { docker(["rm", "-f", nome]); };
  docker([
    "run", "--rm", "-d", "--name", nome,
    "--label", `deskcomm.worktree=${process.cwd()}`, "--label", "deskcomm.harness=test-postgrest",
    "-p", "127.0.0.1::3000",
    "-e", `PGRST_DB_URI=postgres://postgres:postgres@${ip}:5432/postgres`,
    "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon",
    "-e", `PGRST_JWT_SECRET=${segredo}`,
    "public.ecr.aws/supabase/postgrest:v14.5",
  ]);
  try {
    const porta = docker(["port", nome, "3000/tcp"]).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!porta) throw new Error("PostgREST de teste sem porta loopback.");
    const url = `http://127.0.0.1:${porta}`;
    const token = (role: string, sub?: string) => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const body = Buffer.from(JSON.stringify({ role, sub, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
      const texto = `${header}.${body}`;
      return `${texto}.${createHmac("sha256", segredo).update(texto).digest("base64url")}`;
    };
    const cliente: PostgrestLocal["cliente"] = (role, userId) => {
      const jwt = token(role, userId);
      return createClient(url, jwt, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${jwt}` },
          // A URL normal do SDK tem /rest/v1; aqui não há gateway, só PostgREST.
          fetch: (input, init) => {
            const alvo = new URL(String(input));
            if (alvo.origin !== url || !alvo.pathname.startsWith("/rest/v1/")) {
              // Auth Admin API não existe neste harness: não simular nomes/perfis.
              return Promise.resolve(new Response(JSON.stringify({ message: "Auth fora deste harness" }), { status: 404 }));
            }
            alvo.pathname = alvo.pathname.slice("/rest/v1".length);
            return fetch(alvo, init);
          },
        },
      });
    };
    const admin = cliente("service_role");
    const prazo = Date.now() + 20_000;
    let ultimoErro = "";
    while (Date.now() < prazo) {
      const { error } = await admin.from("organizations").select("id").limit(1);
      if (!error) return { url, cliente, encerrar };
      ultimoErro = error.message;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`PostgREST não ficou pronto: ${ultimoErro}`);
  } catch (error) {
    await encerrar();
    throw error;
  }
}
