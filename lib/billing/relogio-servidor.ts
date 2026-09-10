import "server-only";
import { cache } from "react";

/** Mesmo instante para os componentes do request; novo snapshot a cada request. */
export const instanteDoServidor = cache(() => Date.now());
