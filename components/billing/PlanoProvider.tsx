"use client";

import { createContext, useContext } from "react";
import {
  limiteDoPlano,
  recursoDoPlano,
  type AcessoResolvido,
  type LimiteDoPlano,
  type RecursoDoPlano,
} from "@/lib/billing/planos";

const PlanoContext = createContext<AcessoResolvido | null>(null);

export function PlanoProvider({ acesso, children }: { acesso: AcessoResolvido | null; children: React.ReactNode }) {
  return <PlanoContext.Provider value={acesso}>{children}</PlanoContext.Provider>;
}

export function usePlano() {
  const acesso = useContext(PlanoContext);
  return {
    acesso,
    permiteRecurso: (recurso: RecursoDoPlano) => acesso === null || recursoDoPlano(acesso, recurso),
    permiteQuantidade: (limite: LimiteDoPlano, quantidadeDepois: number) => {
      if (acesso === null) return true;
      const teto = limiteDoPlano(acesso, limite);
      return teto === null || quantidadeDepois <= teto;
    },
  };
}
