import type { Lead } from "@/lib/types/leads";
import type { BoardSummary } from "@/lib/kanban/summary";

export interface PipelineVocabulary {
  lead?: string;
  deal?: string;
  won?: string;
  lost?: string;
}

export interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
  is_archived: boolean;
  position: number;
  vocabulary: PipelineVocabulary;
  settings: Record<string, unknown>;
}

export interface Stage {
  id: string;
  organization_id: string;
  pipeline_id: string;
  name: string;
  slug: string;
  position: number;
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
  is_archived: boolean;
  expected_duration_hours: number | null;
}

export interface BoardData {
  pipeline: Pipeline;
  stages: Stage[];
  leads: Lead[];
  /** Totais de negócio por moeda; nunca mistura BRL, USD ou outra moeda. */
  summary: BoardSummary;
}
