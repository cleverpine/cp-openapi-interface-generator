/**
 * Enum generation utilities
 */

import { validateEnumVarNames, sanitizeEnumKey, getEnumValueString } from '../validators/enum-validator';

/**
 * Generate TypeScript enum from OpenAPI enum schema
 */
export function generateEnum(
  name: string,
  schema: any,
  exportMain = true
): string {
  if (!schema.enum || !Array.isArray(schema.enum) || schema.enum.length === 0) {
    throw new Error('Invalid enum schema: missing or empty enum array');
  }

  const lines = [`${exportMain ? 'export ' : ''}enum ${name} {`];
  const varNames = validateEnumVarNames(schema['x-enum-varnames'], schema.enum);
  const usedKeys = new Set<string>();

  schema.enum.forEach((value: any, index: number) => {
    try {
      const comma = index < schema.enum.length - 1 ? ',' : '';
      // Use validated x-enum-varnames if available, otherwise sanitize the value
      const key = varNames[index] || sanitizeEnumKey(value, usedKeys);
      const enumValue = getEnumValueString(value);
      lines.push(`  ${key} = ${enumValue}${comma}`);
    } catch (error: any) {
      throw new Error(
        `Failed to generate enum ${name} at index ${index} (value: ${JSON.stringify(value)}): ${error.message}`
      );
    }
  });

  lines.push('}');
  return lines.join('\n');
}
