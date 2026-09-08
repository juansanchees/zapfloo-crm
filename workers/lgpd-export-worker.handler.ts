/**
 * Handler adapter exposing lgpd-export-worker to the event_log dispatcher.
 *
 * Consumed key: `lgpd-export-worker.v1` — recorded in
 * `event_log.consumed_by[]` so retries skip already-completed runs.
 */

import type { EventHandler } from "@/lib/event-log/dispatcher";

export const LGPD_EXPORT_HANDLER_KEY = "lgpd-export-worker.v1";

export const lgpdExportHandler: EventHandler = {
  key: LGPD_EXPORT_HANDLER_KEY,
  events: ["lgpd.data_request_received"],
  async handle(row) {
    // O renderer de PDF é grande e tem uma árvore CJS/ESM sensível. Carregá-lo
    // ao registrar os handlers derrubava TODO o dreno do event_log quando um
    // subpath do pacote de hifenização era incompatível — mesmo sem evento
    // LGPD. A dependência só cruza este limite quando há trabalho para ela.
    const { processLgpdExport } = await import("@/workers/lgpd-export-worker");
    return processLgpdExport(row);
  },
};
