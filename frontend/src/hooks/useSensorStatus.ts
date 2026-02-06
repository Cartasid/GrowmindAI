import { useEffect, useMemo, useState } from "react";
import { useHaEntity } from "./useHaEntity";
import type { HaEntityState } from "./useHaEntity";
import { apiUrl } from "../api";

type ConfigStatus = "idle" | "loading" | "ready" | "error";
type SensorStatus = "optimal" | "warning" | "critical";

interface ConfigCategory {
  label?: string;
  targets?: ConfigItem[];
  inputs?: ConfigItem[];
}

interface ConfigItem {
  role?: string;
  entity_id?: string;
  [key: string]: unknown;
}

type ConfigMap = Record<string, ConfigCategory>;

interface SensorStatusParams {
  actualRole: string;
  minRole?: string | null;
  maxRole?: string | null;
  targetRole?: string | null;
  alarmRoles?: string[];
  warnRatio?: number;
  pollSeconds?: number;
}

interface SensorStatusResult {
  status: SensorStatus;
  value: number | null;
  min: number | null;
  max: number | null;
  target: number | null;
  entityIds: {
    actual: string | null;
    min: string | null;
    max: string | null;
    target: string | null;
    alarm0: string | null;
    alarm1: string | null;
    alarm2: string | null;
  };
  raw: {
    actual: HaEntityState | null;
    min: HaEntityState | null;
    max: HaEntityState | null;
    target: HaEntityState | null;
    alarm0: HaEntityState | null;
    alarm1: HaEntityState | null;
    alarm2: HaEntityState | null;
  };
}

let _configCache: ConfigMap | null = null;
let _configCacheStatus: ConfigStatus = "idle";
let _configCachePromise: Promise<ConfigMap> | null = null;

const resolveRoleEntity = (config: ConfigMap | null, role: string): string | null => {
  if (!config || typeof config !== "object") return null;
  for (const category of Object.values(config)) {
    const targets: ConfigItem[] = Array.isArray(category?.targets) ? category.targets : [];
    const inputs: ConfigItem[] = Array.isArray(category?.inputs) ? category.inputs : [];
    const pool = targets.concat(inputs);
    for (const item of pool) {
      if (item?.role === role) return (item.entity_id as string) || null;
    }
  }
  return null;
};

const computeStatus = ({
  value,
  min,
  max,
  target,
  warnRatio = 0.1,
}: {
  value: number | null;
  min: number | null;
  max: number | null;
  target: number | null;
  warnRatio: number;
}): SensorStatus => {
  if (value == null || !Number.isFinite(value)) return "critical";

  if (min != null && max != null && Number.isFinite(min) && Number.isFinite(max)) {
    if (value >= min && value <= max) return "optimal";
    const range = Math.max(Math.abs(max - min), Math.abs(max) || 1, 1);
    const margin = range * warnRatio;
    if (value < min - margin || value > max + margin) return "critical";
    return "warning";
  }

  if (target != null && Number.isFinite(target)) {
    const diffRatio = Math.abs(value - target) / (Math.abs(target) || 1);
    if (diffRatio <= warnRatio) return "optimal";
    if (diffRatio <= warnRatio * 2) return "warning";
    return "critical";
  }

  return "optimal";
};

export const useSensorStatus = ({
  actualRole,
  minRole = null,
  maxRole = null,
  targetRole = null,
  alarmRoles = [],
  warnRatio = 0.1,
  pollSeconds = 5,
}: SensorStatusParams): SensorStatusResult => {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus>("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (_configCacheStatus === "ready" && _configCache) {
        setConfig(_configCache);
        setConfigStatus("ready");
        return;
      }

      setConfigStatus("loading");
      try {
        if (!_configCachePromise) {
          _configCacheStatus = "loading";
          _configCachePromise = fetch(apiUrl("/api/config"))
            .then((res) => {
              if (!res.ok) {
                throw new Error(`Config load failed (${res.status})`);
              }
              return res.json() as Promise<ConfigMap>;
            })
            .then((json) => {
              _configCache = json;
              _configCacheStatus = "ready";
              _configCachePromise = null;
              return json;
            })
            .catch((err) => {
              _configCache = null;
              _configCacheStatus = "error";
              _configCachePromise = null;
              throw err;
            });
        }

        const json = await _configCachePromise;
        if (!active) return;
        setConfig(json);
        setConfigStatus("ready");
      } catch {
        if (!active) return;
        setConfig(null);
        setConfigStatus("error");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const actualEntityId = useMemo(() => resolveRoleEntity(config, actualRole), [config, actualRole]);
  const minEntityId = useMemo(() => (minRole ? resolveRoleEntity(config, minRole) : null), [config, minRole]);
  const maxEntityId = useMemo(() => (maxRole ? resolveRoleEntity(config, maxRole) : null), [config, maxRole]);
  const targetEntityId = useMemo(
    () => (targetRole ? resolveRoleEntity(config, targetRole) : null),
    [config, targetRole]
  );

  const alarmRole0 = Array.isArray(alarmRoles) ? alarmRoles[0] ?? null : null;
  const alarmRole1 = Array.isArray(alarmRoles) ? alarmRoles[1] ?? null : null;
  const alarmRole2 = Array.isArray(alarmRoles) ? alarmRoles[2] ?? null : null;

  const alarmEntity0 = useMemo(() => (alarmRole0 ? resolveRoleEntity(config, alarmRole0) : null), [config, alarmRole0]);
  const alarmEntity1 = useMemo(() => (alarmRole1 ? resolveRoleEntity(config, alarmRole1) : null), [config, alarmRole1]);
  const alarmEntity2 = useMemo(() => (alarmRole2 ? resolveRoleEntity(config, alarmRole2) : null), [config, alarmRole2]);

  const actual = useHaEntity(actualEntityId || undefined, pollSeconds);
  const min = useHaEntity(minEntityId || undefined, Math.max(10, pollSeconds * 4));
  const max = useHaEntity(maxEntityId || undefined, Math.max(10, pollSeconds * 4));
  const target = useHaEntity(targetEntityId || undefined, Math.max(10, pollSeconds * 4));

  const alarm0 = useHaEntity(alarmEntity0 || undefined, Math.max(2, pollSeconds));
  const alarm1 = useHaEntity(alarmEntity1 || undefined, Math.max(2, pollSeconds));
  const alarm2 = useHaEntity(alarmEntity2 || undefined, Math.max(2, pollSeconds));

  const value = actual.valueNumber;
  const minValue = min.valueNumber;
  const maxValue = max.valueNumber;
  const targetValue = target.valueNumber;

  const status = useMemo((): SensorStatus => {
    return computeStatus({
      value,
      min: minValue,
      max: maxValue,
      target: targetValue,
      warnRatio,
    });
  }, [value, minValue, maxValue, targetValue, warnRatio]);

  const unavailable =
    actual.raw?.state === "unavailable" ||
    actual.raw?.state === "unknown" ||
    actual.raw == null ||
    configStatus === "error";

  const alarmTriggered = (() => {
    const states = [
      { id: alarmEntity0, raw: alarm0.raw },
      { id: alarmEntity1, raw: alarm1.raw },
      { id: alarmEntity2, raw: alarm2.raw },
    ];

    return states.some(({ id, raw }) => {
      if (!id) return false;
      const state = raw?.state;
      if (!state) return false;
      const normalized = String(state).toLowerCase();
      // Only treat actual alarm states as triggered, not unavailable/unknown
      return normalized === "on" || normalized === "true" || normalized === "detected";
    });
  })();

  // Check if sensors are unavailable separately
  const sensorsUnavailable = (() => {
    const states = [
      { id: actualEntityId, raw: actual.raw },
      { id: minEntityId, raw: minEntity.raw },
      { id: maxEntityId, raw: maxEntity.raw },
    ];
    
    return states.some(({ id, raw }) => {
      if (!id) return false;
      const state = raw?.state;
      if (!state) return true; // No state = unavailable
      const normalized = String(state).toLowerCase();
      return normalized === "unavailable" || normalized === "unknown";
    });
  })();

  const normalizedStatus: SensorStatus = alarmTriggered ? "critical" : (sensorsUnavailable || unavailable) ? "error" : status;

  return {
    status: normalizedStatus,
    value,
    min: minValue,
    max: maxValue,
    target: targetValue,
    entityIds: {
      actual: actualEntityId,
      min: minEntityId,
      max: maxEntityId,
      target: targetEntityId,
      alarm0: alarmEntity0,
      alarm1: alarmEntity1,
      alarm2: alarmEntity2,
    },
    raw: {
      actual: actual.raw,
      min: min.raw,
      max: max.raw,
      target: target.raw,
      alarm0: alarm0.raw,
      alarm1: alarm1.raw,
      alarm2: alarm2.raw,
    },
  };
};
