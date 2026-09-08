export interface DiagnosticoDoEnsaio {
  motivo: string;
  destino: string;
}

/** Ação humana por código estável; o texto cru fica só como último recurso. */
export function diagnosticoDoEnsaio(
  codigo: string | undefined,
  mensagem: string | undefined,
): DiagnosticoDoEnsaio {
  if (
    codigo === "credential_invalid" ||
    codigo === "credential_not_found" ||
    codigo === "credential_inactive" ||
    codigo === "credential_not_validated" ||
    codigo === "credential_decrypt_failed"
  ) {
    return {
      motivo: "Esta versão não tem uma chave utilizável para a empresa de IA escolhida.",
      destino: "IA › Credenciais",
    };
  }
  if (codigo === "credential_provider_mismatch") {
    return {
      motivo: "A chave e o modelo desta versão pertencem a empresas de IA diferentes.",
      destino: "IA › Agentes",
    };
  }
  if (codigo === "credencial_recusada") {
    return {
      motivo: "A empresa de IA recusou a chave cadastrada.",
      destino: "IA › Credenciais",
    };
  }
  if (codigo === "limite_ou_saldo") {
    return {
      motivo: "A empresa de IA recusou a geração por limite de uso ou saldo.",
      destino: "conta da empresa de IA",
    };
  }
  if (codigo === "modelo_inexistente" || codigo === "modelo_sem_ferramentas") {
    return {
      motivo: "O modelo escolhido não está disponível ou não atende ao que este agente precisa.",
      destino: "IA › Agentes",
    };
  }
  if (codigo === "provedor_indisponivel") {
    return {
      motivo: "A empresa de IA está indisponível ou demorou demais para responder.",
      destino: "tentar novamente em alguns minutos",
    };
  }
  return {
    motivo: mensagem?.trim() || "Não foi possível identificar a causa desta falha.",
    destino: "IA › Execuções",
  };
}
