/**
 * Guard against non-array API payloads (error objects, HTML, null).
 * Prevents runtime crashes like "x.filter is not a function".
 */
export function asArray<T = any>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function asObject<T extends Record<string, any> = Record<string, any>>(
  value: unknown,
  fallback: T | null = null
): T | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  return fallback;
}
