const PAPEL_LEGIVEL: Record<string, string> = {
  viewer: "Leitor",
  agent: "Atendente",
  manager: "Gestor",
  admin: "Administrador",
};

/** Rótulo puro e seguro para cliente: sem UUID e sem e-mail. */
export function rotuloDoAtendente(args: {
  userId: string;
  usuarioAtualId?: string | null;
  fullName?: string | null;
  role?: string | null;
  t?: (texto: string) => string;
}): string {
  const t = args.t ?? ((texto: string) => texto);
  if (args.usuarioAtualId && args.userId === args.usuarioAtualId) return t("Você");
  const nome = args.fullName?.trim();
  if (nome) return nome;
  const papel = PAPEL_LEGIVEL[args.role ?? ""] ?? args.role ?? "membro";
  return `${t("Sem nome")} — ${t(papel)}`;
}
