/**
 * OpenAPI spec resolution utilities
 */

import type { OpenAPISpec } from '../types';

/**
 * Resolve OpenAPI $ref reference to actual schema object
 */
export function resolveRef(ref: string, spec: OpenAPISpec): any {
  const parts = ref.replace(/^#\//, '').split('/');
  return parts.reduce((acc: any, part: string) => acc?.[part], spec);
}

/**
 * Extract the schema name from a $ref string
 */
export function getSchemaNameFromRef(ref: string): string {
  return ref.split('/').pop() || 'Unknown';
}
