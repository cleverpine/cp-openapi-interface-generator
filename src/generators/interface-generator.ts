/**
 * TypeScript interface generation from OpenAPI schemas
 */

import type { OpenAPISpec } from '../types';
import { toPascalCase } from '../utils/converters';
import { resolveRef, getSchemaNameFromRef } from '../utils/openapi-resolver';
import { generateEnum } from './enum-generator';
import { PRIMITIVE_TYPES } from '../config/constants';

// Global type deduplication to prevent duplicate generation
export const globalSeenTypes = new Set<string>();
export const generatedTypeDefinitions: Record<string, string> = {};

/**
 * Convert OpenAPI schema to TypeScript type string
 */
export function getTypeFromSchema(schema: any, spec?: OpenAPISpec): string {
  if (!schema) return 'unknown';

  // Handle $ref - resolve it first
  if (schema.$ref && spec) {
    const resolvedSchema = resolveRef(schema.$ref, spec);
    if (resolvedSchema) {
      return getTypeFromSchema(resolvedSchema, spec);
    }
    return 'unknown';
  }

  // Handle enums - generate union type for inline enums in parameters
  // This is intentionally different from named enums which use the enum keyword
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((value: any) => {
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      // Escape single quotes in string values
      const escaped = String(value).replace(/'/g, "\\'");
      return `'${escaped}'`;
    }).join(' | ');
  }

  switch (schema.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'array':
      const itemType = getTypeFromSchema(schema.items, spec);
      return `${itemType}[]`;
    default:
      return 'unknown';
  }
}

/**
 * Convert OpenAPI schema value to TypeScript type string
 */
export function toTsType(
  value: any,
  name: string,
  nestedInterfaces: string[],
  spec: OpenAPISpec
): string {
  if (value.$ref) {
    const ref = resolveRef(value.$ref, spec);
    if (ref) {
      const typeName = getSchemaNameFromRef(value.$ref);
      if (!globalSeenTypes.has(typeName)) {
        globalSeenTypes.add(typeName);
        const interfaceCode = generateInterface(typeName, ref, spec, nestedInterfaces, true);
        generatedTypeDefinitions[typeName] = interfaceCode;
        nestedInterfaces.push(interfaceCode);
      }
      return typeName;
    }
    return 'unknown';
  }

  // Handle inline enums - create a nested enum type
  if (value.enum && Array.isArray(value.enum) && value.enum.length > 0) {
    const typeName = toPascalCase(name);
    if (!globalSeenTypes.has(typeName)) {
      globalSeenTypes.add(typeName);
      const enumCode = generateInterface(typeName, value, spec, nestedInterfaces, true);
      generatedTypeDefinitions[typeName] = enumCode;
      nestedInterfaces.push(enumCode);
    }
    return typeName;
  }

  if (value.type === 'array') {
    const items = value.items;
    if (items?.$ref) {
      const ref = resolveRef(items.$ref, spec);
      if (ref) {
        const typeName = getSchemaNameFromRef(items.$ref);
        if (!globalSeenTypes.has(typeName)) {
          globalSeenTypes.add(typeName);
          const interfaceCode = generateInterface(typeName, ref, spec, nestedInterfaces, true);
          generatedTypeDefinitions[typeName] = interfaceCode;
          nestedInterfaces.push(interfaceCode);
        }
        return `${typeName}[]`;
      }
    } else if (items?.type === 'object' || items?.properties) {
      const typeName = toPascalCase(`${name}Item`);
      if (!globalSeenTypes.has(typeName)) {
        globalSeenTypes.add(typeName);
        const interfaceCode = generateInterface(typeName, items, spec, nestedInterfaces, false);
        generatedTypeDefinitions[typeName] = interfaceCode;
        nestedInterfaces.push(interfaceCode);
      }
      return `${typeName}[]`;
    } else {
      return `${items?.type ?? 'any'}[]`;
    }
  }

  if (value.type === 'object' || value.properties) {
    // If object has no properties and no additionalProperties defined, treat as generic object
    if (value.type === 'object' && !value.properties && value.additionalProperties === undefined) {
      return 'Record<string, unknown>';
    }

    const typeName = toPascalCase(`${name}Item`);
    if (!globalSeenTypes.has(typeName)) {
      globalSeenTypes.add(typeName);
      const interfaceCode = generateInterface(typeName, value, spec, nestedInterfaces, false);
      generatedTypeDefinitions[typeName] = interfaceCode;
      nestedInterfaces.push(interfaceCode);
    }
    return typeName;
  }

  switch (value.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    default:
      return 'any';
  }
}

/**
 * Generate TypeScript interface from OpenAPI schema
 */
export function generateInterface(
  name: string,
  schema: any,
  spec: OpenAPISpec,
  nestedInterfaces: string[] = [],
  exportMain = true
): string {
  // Schema is considered invalid if it has no properties, type, or enum definition
  const hasProperties = schema?.properties;
  const hasType = schema?.type;
  const hasEnum = schema?.enum;

  if (!schema || (!hasProperties && !hasType && !hasEnum)) {
    return `${exportMain ? 'export ' : ''}type ${name} = unknown;`;
  }

  // Handle enum schemas - generate TypeScript enum
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return generateEnum(name, schema, exportMain);
  }

  if (schema.type === 'array' && schema.items) {
    const itemName = toPascalCase(`${name}Item`);
    const itemSchema = schema.items.$ref ? resolveRef(schema.items.$ref, spec) : schema.items;
    if (itemSchema) {
      if (!globalSeenTypes.has(itemName)) {
        globalSeenTypes.add(itemName);
        const interfaceCode = generateInterface(itemName, itemSchema, spec, nestedInterfaces, false);
        generatedTypeDefinitions[itemName] = interfaceCode;
        nestedInterfaces.push(interfaceCode);
      }
      return `${exportMain ? 'export ' : ''}type ${name} = ${itemName}[];`;
    }
    return `${exportMain ? 'export ' : ''}type ${name} = unknown[];`;
  }

  const lines = [`${exportMain ? 'export ' : ''}interface ${name} {`];
  for (const [prop, val] of Object.entries(schema.properties || {})) {
    const value = val as any;
    const optional = schema.required?.includes(prop) ? '' : '?';
    const tsType = toTsType(value, `${name}${toPascalCase(prop)}`, nestedInterfaces, spec);
    lines.push(`  ${prop}${optional}: ${tsType};`);
  }
  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate TypeScript interface from parameter object
 */
export function generateParamsInterface(
  params: Record<string, string>,
  typeName: string,
  exportInterface = true
): string {
  if (!params || Object.keys(params).length === 0) {
    return '{}';
  }

  const exportPrefix = exportInterface ? 'export ' : '';
  const lines = [`${exportPrefix}interface ${typeName} {`];
  for (const [prop, type] of Object.entries(params)) {
    lines.push(`  ${prop}: ${type};`);
  }
  lines.push('}');

  return lines.join('\n');
}
