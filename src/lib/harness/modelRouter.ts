import type { NebulaConfig, Tier } from "./types";

/** A dsh route: provider name in settings.yaml plus model id. */
export interface Candidate {
  provider: "omniroute" | "nvidia-nim";
  model: string;
  label: string;
}

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  missingModels: string[];
  hasKey: boolean;
}

export function candidates(tier: Tier, config: NebulaConfig): Candidate[] {
  const omniroute: Candidate = { provider: "omniroute", model: config.omnirouteModel, label: `OmniRoute ${config.omnirouteModel}` };
  if (tier === "low") return [omniroute];
  if (tier === "medium") {
    return [
      // Labels are the configured ids: the slots are user-editable, so any
      // fixed name would misreport which model ran.
      { provider: "nvidia-nim", model: config.nimModels.kimi, label: config.nimModels.kimi },
      { provider: "nvidia-nim", model: config.nimModels.deepseek, label: config.nimModels.deepseek },
      { provider: "nvidia-nim", model: config.nimModels.nemotron, label: config.nimModels.nemotron },
      omniroute,
    ];
  }
  return [];
}

/** ACP `model` config option value for a candidate. */
export function modelOptionValue(candidate: Candidate): string {
  return JSON.stringify([candidate.provider, candidate.model]);
}

export const DOWN_MS = 60_000;
export const PROBE_TTL_MS = 60_000;

const probeKey = (provider: Candidate["provider"]) => (provider === "nvidia-nim" ? "nvidia" : "omniroute");

/**
 * Remembers probe results and candidates that just failed. A failed candidate
 * is skipped for a minute, then tried again.
 */
export class Router {
  private probes = new Map<string, { at: number; result: ProbeResult }>();
  private down = new Map<string, number>();

  constructor(
    private probe: (provider: "nvidia" | "omniroute") => Promise<ProbeResult>,
    private now: () => number = Date.now,
  ) {}

  private async probeFor(provider: Candidate["provider"]) {
    const key = probeKey(provider);
    const cached = this.probes.get(key);
    if (cached && this.now() - cached.at < PROBE_TTL_MS) return cached.result;
    let result: ProbeResult;
    try {
      result = await this.probe(key);
    } catch (err) {
      result = { ok: false, status: null, error: String(err), missingModels: [], hasKey: false };
    }
    this.probes.set(key, { at: this.now(), result });
    return result;
  }

  private id(c: Candidate) {
    return `${c.provider}/${c.model}`;
  }

  markDown(candidate: Candidate) {
    this.down.set(this.id(candidate), this.now());
    // A failure means the cached probe is stale too.
    this.probes.delete(probeKey(candidate.provider));
  }

  isDown(candidate: Candidate) {
    const at = this.down.get(this.id(candidate));
    return at !== undefined && this.now() - at < DOWN_MS;
  }

  /** Why a candidate would be skipped, or null when it is usable. */
  async unavailableReason(candidate: Candidate): Promise<string | null> {
    if (this.isDown(candidate)) return "failed in the last minute";
    const probe = await this.probeFor(candidate.provider);
    if (candidate.provider === "nvidia-nim" && !probe.hasKey) return "no NVIDIA API key";
    if (!probe.ok) return probe.error ?? `endpoint returned ${probe.status}`;
    if (probe.missingModels.includes(candidate.model)) return "model not listed by the endpoint";
    return null;
  }

  /**
   * Usable candidates in priority order, starting after `after` when given.
   * When none look usable, the last candidate is still returned so the user
   * sees the real error instead of silence.
   */
  async available(tier: Tier, config: NebulaConfig, after?: Candidate): Promise<{ usable: Candidate[]; skipped: { candidate: Candidate; reason: string }[] }> {
    let list = candidates(tier, config);
    if (after) {
      const index = list.findIndex((c) => this.id(c) === this.id(after));
      list = index >= 0 ? list.slice(index + 1) : list;
    }
    const usable: Candidate[] = [];
    const skipped: { candidate: Candidate; reason: string }[] = [];
    for (const candidate of list) {
      const reason = await this.unavailableReason(candidate);
      if (reason) skipped.push({ candidate, reason });
      else usable.push(candidate);
    }
    if (usable.length === 0 && list.length > 0 && !after) usable.push(list[list.length - 1]);
    return { usable, skipped };
  }
}

/** Errors that mean "this route is not working", so the next one should be tried. */
export function isRouteFailure(message: string): boolean {
  return /\b(401|403|404|408|429|5\d\d)\b|MISSING_CREDENTIAL|INVALID_CREDENTIAL|UNKNOWN_MODEL|rate.?limit|timed? ?out|timeout|ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|overloaded|unavailable/i.test(
    message,
  );
}
