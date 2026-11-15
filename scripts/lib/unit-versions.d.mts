// Types for unit-versions.mjs (the web app's tests import it).
export function fileVersion(name: unknown): number;
export function auditVersions(entries: Array<{ unitId?: unknown; owner?: unknown; version?: unknown } | null | undefined>): Map<string, number>;
export function counterFor(unit: { lastVersion?: unknown; publishedVersion?: unknown; audited?: unknown; files?: string[] }): number;
export function needsFiles(unit: { lastVersion?: unknown; publishedVersion?: unknown }): boolean;
export function orphans(audited: Map<string, number>, unitKeys: Iterable<string>): string[];
