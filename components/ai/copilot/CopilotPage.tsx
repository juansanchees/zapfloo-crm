"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { Brain, PaperPlaneTilt, ShieldCheck, Sparkle } from "@/lib/ui/icons";
import styles from "./copilot.module.css";

interface Source {
  kind: string;
  label: string;
  href: string;
}

interface ApiResult {
  data: {
    answer: string;
    sources: Source[];
    consulted_tools: string[];
  };
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const SUGGESTIONS = [
  "Quais clientes precisam de atenção hoje?",
  "Resuma as oportunidades abertas por etapa.",
  "O que minha equipe deve priorizar agora?",
] as const;

export function CopilotPage() {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value = question) {
    const clean = value.trim();
    if (sending || clean.length < 2) return;
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: clean }]);
    setQuestion("");
    setSending(true);
    setError(null);
    try {
      const response = await apiClient.post<ApiResult>(
        "/api/v1/ai/ask",
        {
          question: clean,
          history,
        },
        {
          // O modelo pode levar 30s e a rota até 45s. Não abandone nem
          // repita uma consulta custosa que pode consumir créditos de IA.
          timeoutMs: 50_000,
          retry: false,
        },
      );
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.data.answer,
          sources: response.data.sources,
        },
      ]);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.message
          ? cause.message
          : t("Não foi possível analisar o CRM agora. Tente novamente."),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.icon} aria-hidden>
          <Brain weight="fill" />
        </div>
        <div>
          <p className={styles.eyebrow}>{t("COPILOTO DA OPERAÇÃO")}</p>
          <h1>{t("Pergunte à IA")}</h1>
          <p>{t("Transforme os dados do seu CRM em prioridades claras para o time.")}</p>
        </div>
        <span className={styles.readOnly}>
          <ShieldCheck aria-hidden />
          {t("Somente leitura")}
        </span>
      </header>

      <div className={styles.workspace}>
        <div className={styles.thread} aria-live="polite">
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <Sparkle size={28} aria-hidden />
              <h2>{t("O que você quer entender hoje?")}</h2>
              <p>
                {t(
                  "Eu consulto conversas, funis, agenda e clientes em risco sem alterar nenhum registro.",
                )}
              </p>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => void submit(suggestion)}>
                    {t(suggestion)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className={styles.messages}>
              {messages.map((message, index) => (
                <li key={`${message.role}-${index}`} className={styles[message.role]}>
                  <span className={styles.messageRole}>
                    {message.role === "user" ? t("Você") : t("Copiloto")}
                  </span>
                  <p>{message.content}</p>
                  {!!message.sources?.length && (
                    <div className={styles.sources}>
                      <span>{t("Fontes consultadas")}</span>
                      {message.sources.map((source) => (
                        <Link key={`${source.kind}-${source.href}`} href={source.href}>
                          {t(source.label)}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {sending && (
            <div role="status" className={styles.thinking}>
              <span aria-hidden />
              {t("Analisando as fontes do CRM…")}
            </div>
          )}
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
        </div>

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <textarea
            value={question}
            maxLength={2_000}
            rows={2}
            aria-label={t("Pergunta sobre o CRM")}
            placeholder={t("Ex.: quais oportunidades correm risco de esfriar esta semana?")}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div>
            <span>{question.length}/2000</span>
            <Button
              type="submit"
              size="icon"
              disabled={sending || question.trim().length < 2}
              aria-label={t("Enviar pergunta")}
            >
              <PaperPlaneTilt weight="fill" aria-hidden />
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
