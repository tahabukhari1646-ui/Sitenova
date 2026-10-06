export { PerformanceStrategy } from "../../generated/prisma/client";

// Local (non-Prisma) type, mirroring monitor/types.ts's own HistoryRange —
// each module keeps its own copy rather than sharing one across features.
export type PerformanceHistoryRange = "24h" | "7d" | "30d";
