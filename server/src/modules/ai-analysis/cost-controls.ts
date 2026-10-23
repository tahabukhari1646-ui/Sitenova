import { AppError } from "../../errors/AppError";
import { aiAnalysisRepository, type AiAnalysisTarget } from "./repository";

// Stage 18.7: AI cost controls. Every MANUAL analysis passes, in order:
//   1. reuse   -- an identical SUCCEEDED analysis (same target, input
//                 fingerprint, provider and model) is returned for free
//                 (service.ts; skipped only with ?force=true);
//   2. cooldown -- at most one paid manual run per target per N seconds;
//   3. daily limit -- at most N paid manual runs per user per rolling 24h.
// Steps 2-3 live here and run only when a provider call is about to happen.
// AUTOMATIC analyses are gated separately by isAutomaticAiEnabled().
//
// All settings are read at call time (so a .env change applies after a
// restart without code changes). Invalid values fall back to the default
// with a warning -- they never disable a limit by accident.
//
// Known V1 limitation: two requests in the same instant can both pass the
// cooldown/limit checks (check-then-call, no DB lock). The frontend disables
// the button while a run is pending, which covers the normal case.

const DEFAULT_COOLDOWN_SECONDS = 30;
const DEFAULT_DAILY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

// Same 4xx-from-AppError precedent as NotFoundError/ValidationError; the
// message is shown as-is by the frontend cards, so it is curated and never
// reveals configuration values.
export class AiRateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429);
    this.name = "AiRateLimitError";
  }
}

function readNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    console.warn(`${name} must be a non-negative integer; using the default (${fallback}).`);
    return fallback;
  }
  return Number(raw);
}

export function getManualCooldownSeconds(): number {
  return readNonNegativeInt("AI_MANUAL_COOLDOWN_SECONDS", DEFAULT_COOLDOWN_SECONDS);
}

// 0 means "no paid manual runs at all" (reuse of existing results still
// works), never "unlimited".
export function getManualDailyLimit(): number {
  return readNonNegativeInt("AI_MANUAL_DAILY_LIMIT", DEFAULT_DAILY_LIMIT);
}

// Explicit "true"/"false" always wins. Unset follows the existing AI_PROVIDER
// production-safety precedent: ON in development (today's behavior is
// unchanged), OFF in production until explicitly enabled.
export function isAutomaticAiEnabled(): boolean {
  const raw = process.env.AI_AUTOMATIC_ENABLED?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw) console.warn("AI_AUTOMATIC_ENABLED must be 'true' or 'false'; using the default.");
  return process.env.NODE_ENV !== "production";
}

// Throws AiRateLimitError when a PAID manual run must not happen now.
// Called only after the free reuse step found nothing to return.
export async function enforceManualLimits(userId: string, target: AiAnalysisTarget): Promise<void> {
  const cooldownSeconds = getManualCooldownSeconds();
  if (cooldownSeconds > 0) {
    const last = await aiAnalysisRepository.findLatestManualCreatedAt(target);
    if (last && Date.now() - last.getTime() < cooldownSeconds * 1000) {
      throw new AiRateLimitError("Please wait a few seconds before running another AI analysis for this item.");
    }
  }

  const dailyLimit = getManualDailyLimit();
  const used = await aiAnalysisRepository.countManualSinceForUser(userId, new Date(Date.now() - DAY_MS));
  if (used >= dailyLimit) {
    throw new AiRateLimitError("Daily AI analysis limit reached. Try again later.");
  }
}
