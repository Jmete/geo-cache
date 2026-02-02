export type LogLevel = 'info' | 'warn' | 'error';
export type LogFieldValue = string | number | boolean | null;
export type LogFields = Record<string, LogFieldValue | undefined>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface LogBaseFields {
  requestId: string;
  path: string;
  method: string;
}

function normalizeFields(fields?: LogFields): Record<string, LogFieldValue> {
  if (!fields) {
    return {};
  }

  const normalized: Record<string, LogFieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function generateRequestId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveRequestId(
  primary?: string | null,
  secondary?: string | null
): string {
  const primaryValue = primary?.trim();
  if (primaryValue) {
    return primaryValue;
  }

  const secondaryValue = secondary?.trim();
  if (secondaryValue) {
    return secondaryValue;
  }

  return generateRequestId();
}

export function createLogger(base: LogBaseFields): Logger {
  const baseFields = normalizeFields({
    requestId: base.requestId,
    path: base.path,
    method: base.method,
  });

  const emit = (level: LogLevel, event: string, fields?: LogFields): void => {
    const payload = {
      level,
      event,
      ...baseFields,
      ...normalizeFields(fields),
      ts: new Date().toISOString(),
    };

    const serialized = JSON.stringify(payload);
    if (level === 'error') {
      console.error(serialized);
    } else {
      console.log(serialized);
    }
  };

  return {
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}
