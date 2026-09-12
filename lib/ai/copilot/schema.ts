import { z } from "zod";

export const copilotHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});

export const copilotRequestSchema = z.object({
  question: z.string().trim().min(2).max(2_000),
  history: z.array(copilotHistoryMessageSchema).max(6).default([]),
});

export type CopilotRequest = z.infer<typeof copilotRequestSchema>;
