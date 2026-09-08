import type { Metadata } from "next";

import { nomeDoOperador, resolverOperador } from "@/lib/legal/operador";
import { createClient } from "@/lib/supabase/server";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exclusão de dados" };

export default async function DataDeletionPage() {
  const op = await resolverOperador();
  const operador = nomeDoOperador(op);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = normalizarIdioma((user?.user_metadata?.locale as string | undefined) ?? null);
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Exclusão de dados")}</h1>
        <p className="text-muted-foreground">
          {t("Como pedir acesso, anonimização ou exclusão dos dados tratados nesta instalação.")}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("1. Quem atende o pedido")}</h2>
        <p>
          {t("O responsável por analisar e atender o pedido é")} <strong>{operador}</strong>
          {op.cnpj ? ` (CNPJ ${op.cnpj})` : ""}.{" "}
          {t("O software não envia esse pedido a terceiros.")}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("2. Como fazer o pedido")}</h2>
        <p>
          {t(
            "Informe que deseja exercer seus direitos sobre dados pessoais e indique o telefone ou e-mail usado no atendimento, para que o operador consiga localizar os registros corretos.",
          )}
        </p>
        <p>
          {op.dpoEmail ? (
            <>
              {t("Envie o pedido ao encarregado de dados:")}{" "}
              <a className="underline underline-offset-2" href={`mailto:${op.dpoEmail}`}>
                {op.dpoEmail}
              </a>
              .
            </>
          ) : (
            <>
              {t(
                "Envie o pedido pelos canais de atendimento publicados pela organização que opera esta instalação.",
              )}
            </>
          )}
        </p>
        <p>
          {t(
            "Não envie senha, token de acesso ou documento de identidade nesta primeira mensagem. O operador poderá pedir uma confirmação segura de identidade antes de agir.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("3. O que acontece depois")}</h2>
        <p>
          {t(
            "O operador confirma a identidade, localiza os dados e avalia o pedido conforme a LGPD. Quando aplicável, o sistema pode exportar os dados ou anonimizar a identificação de forma irreversível.",
          )}
        </p>
        <p>
          {t(
            "Registros que precisem ser mantidos por obrigação legal, prevenção a fraude, segurança ou exercício de direitos podem ser preservados pelo período necessário, com acesso restrito.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("4. Resposta")}</h2>
        <p>
          {t(
            "O operador responderá pelo canal informado, indicando o que foi atendido ou a razão legal para eventual retenção.",
          )}
        </p>
        <p>
          <a className="underline underline-offset-2" href="/legal/privacy">
            {t("Leia também a Política de Privacidade.")}
          </a>
        </p>
      </section>
    </>
  );
}
