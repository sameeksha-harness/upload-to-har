/**
 * Canonical list of artifact types this action supports.
 * Keep action.yml `type` description and README in sync with this list.
 */
export const SUPPORTED_TYPES = [
  'generic',
  'maven',
  'rpm',
  'npm',
  'conda',
  'composer',
  'go',
  'cargo',
  'dart',
  'python',
  'nuget',
  'swift',
  'puppet',
  'debian',
  'conan',
  'terraform',
] as const;

export type SupportedType = (typeof SUPPORTED_TYPES)[number];

export const SUPPORTED_TYPES_LIST = SUPPORTED_TYPES.join(', ');

export function isSupportedType(type: string): type is SupportedType {
  return (SUPPORTED_TYPES as readonly string[]).includes(type);
}
