"use client";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { AgentStatusBadge, deriveAgentStatus } from "./AgentStatusBadge";
import { AgentRowMenu } from "./AgentRowMenu";

interface Props {
  agent: AgentRow;
  canWrite: boolean;
}

export function AgentCard({ agent, canWrite }: Props) {
  const t = useT();
  const status = deriveAgentStatus(agent);

  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium" title={agent.name}>
            {agent.name}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {agent.is_default && (
            <Badge variant="secondary" className="text-xs">
              {t("Padrão")}
            </Badge>
          )}
          <AgentStatusBadge status={status} />
          {canWrite && <AgentRowMenu agent={agent} />}
        </div>
      </div>
      {agent.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
      )}
      <div className="mt-auto pt-2">
        <Link href={`/app/ai/agents/${agent.id}`}>
          <Button variant="outline" size="sm" className="w-full">
            {canWrite ? t("Editar") : t("Visualizar")}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
