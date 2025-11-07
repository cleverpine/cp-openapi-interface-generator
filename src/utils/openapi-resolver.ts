/**
 * OpenAPI spec resolution utilities
 */

import type { OpenAPISpec } from '../types';

/**
 * Resolve OpenAPI $ref reference to actual schema object
 * @param ref - The $ref string (e.g., "#/components/schemas/User")
 * @param spec - The complete OpenAPI specification object
 * @returns The resolved schema object
 * @throws Error if ref is invalid or cannot be resolved
 */
export function resolveRef(ref: string, spec: OpenAPISpec): any {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Invalid $ref: must be a non-empty string');
  }

  if (!ref.startsWith('#/')) {
    throw new Error(`Invalid $ref format: ${ref}. Must start with #/`);
  }

  const parts = ref.replace(/^#\//, '').split('/');
  const result = parts.reduce((acc: any, part: string) => acc?.[part], spec);

  if (result === undefined) {
    throw new Error(`Unable to resolve $ref: ${ref}`);
  }

  return result;
}

/**
 * Extract the schema name from a $ref string
 * @param ref - The $ref string (e.g., "#/components/schemas/User")
 * @returns The schema name (e.g., "User")
 * @throws Error if ref is invalid or schema name cannot be extracted
 */
export function getSchemaNameFromRef(ref: string): string {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Invalid $ref: must be a non-empty string');
  }

  const name = ref.split('/').pop();
  if (!name) {
    throw new Error(`Unable to extract schema name from $ref: ${ref}`);
  }

  return name;
}
