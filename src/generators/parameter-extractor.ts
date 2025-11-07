/**
 * Parameter extraction utilities from OpenAPI specs
 */

import type { OpenAPISpec } from '../types';
import { toPascalCase } from '../utils/converters';
import { resolveRef, getSchemaNameFromRef } from '../utils/openapi-resolver';
import { getTypeFromSchema } from './interface-generator';
import { MAX_PARAM_NAME_COMBINATION, HTTP_SUCCESS_STATUSES, CONTENT_TYPE } from '../config/constants';

/**
 * Extract path parameters from OpenAPI parameters
 * @param parameters - Array of OpenAPI parameter objects
 * @param spec - The complete OpenAPI specification object
 * @returns Record mapping parameter names to TypeScript types
 */
export function extractPathParams(parameters: any[], spec: OpenAPISpec): Record<string, string> {
  if (!parameters) return {};

  const pathParams: Record<string, string> = {};
  parameters
    .filter(param => {
      if (param.$ref) {
        const resolvedParam = resolveRef(param.$ref, spec);
        return resolvedParam && resolvedParam.in === 'path';
      }
      return param.in === 'path';
    })
    .forEach(param => {
      if (param.$ref) {
        const resolvedParam = resolveRef(param.$ref, spec);
        if (resolvedParam) {
          pathParams[resolvedParam.name] = getTypeFromSchema(resolvedParam.schema, spec);
        }
      } else {
        pathParams[param.name] = getTypeFromSchema(param.schema, spec);
      }
    });

  return pathParams;
}

/**
 * Extract query parameters from OpenAPI parameters
 * @param parameters - Array of OpenAPI parameter objects
 * @param spec - The complete OpenAPI specification object
 * @returns Record mapping parameter names (with ? suffix for optional) to TypeScript types
 */
export function extractQueryParams(parameters: any[], spec: OpenAPISpec): Record<string, string> {
  if (!parameters) return {};

  const queryParams: Record<string, string> = {};
  parameters
    .filter(param => {
      if (param.$ref) {
        const resolvedParam = resolveRef(param.$ref, spec);
        return resolvedParam && resolvedParam.in === 'query';
      }
      return param.in === 'query';
    })
    .forEach(param => {
      if (param.$ref) {
        const resolvedParam = resolveRef(param.$ref, spec);
        if (resolvedParam) {
          const optional = resolvedParam.required ? '' : '?';
          queryParams[resolvedParam.name + optional] = getTypeFromSchema(resolvedParam.schema, spec);
        }
      } else {
        const optional = param.required ? '' : '?';
        queryParams[param.name + optional] = getTypeFromSchema(param.schema, spec);
      }
    });

  return queryParams;
}

/**
 * Create a signature string for parameter deduplication
 * @param params - Record of parameter names to types
 * @returns Deterministic signature string (e.g., "id:string|name:string")
 */
export function createParamSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys.map(key => `${key}:${params[key]}`).join('|');
}

/**
 * Find or create a reusable parameter type name
 * @param params - Record of parameter names to types
 * @param paramType - Type of parameters ('path' or 'query')
 * @param fallbackName - Name to use for complex parameter combinations (4+ parameters)
 * @param parameterTypes - Map tracking parameter signatures to type names (mutated)
 * @returns Type name for this parameter combination (reused if signature matches existing)
 */
export function getReusableParamTypeName(
  params: Record<string, string>,
  paramType: string,
  fallbackName: string,
  parameterTypes: Map<string, string>
): string {
  const signature = createParamSignature(params);

  // Check if we already have this parameter pattern
  for (const [existingName, existingSignature] of parameterTypes.entries()) {
    if (existingSignature === signature) {
      return existingName;
    }
  }

  // Create generic parameter type names based on parameter keys
  const keys = Object.keys(params).sort();

  // For single parameter, create type name based on parameter name
  if (keys.length === 1) {
    const paramName = keys[0].replace(/\?$/, '');
    const typeName = `${toPascalCase(paramName)}${toPascalCase(paramType)}Params`;
    parameterTypes.set(typeName, signature);
    return typeName;
  }

  // For multiple parameters, create composite name based on all parameter names
  if (keys.length > 1 && keys.length <= MAX_PARAM_NAME_COMBINATION) {
    const paramNames = keys
      .map(key => {
        const cleanKey = key.replace(/\?$/, '');
        return toPascalCase(cleanKey);
      })
      .join('');
    const typeName = `${paramNames}${toPascalCase(paramType)}Params`;
    parameterTypes.set(typeName, signature);
    return typeName;
  }

  // Use fallback name for complex parameter combinations (4+ parameters)
  parameterTypes.set(fallbackName, signature);
  return fallbackName;
}

/**
 * Generate TypeScript type name for request body
 * @param requestBody - OpenAPI request body schema object
 * @param operationId - Operation ID from OpenAPI spec
 * @returns TypeScript type name or 'void' if no request body
 */
export function getRequestTypeName(requestBody: any, operationId: string): string {
  if (!requestBody) {
    return 'void';
  }

  if (requestBody.$ref) {
    return getSchemaNameFromRef(requestBody.$ref);
  }

  return `${toPascalCase(operationId)}Request`;
}

/**
 * Generate TypeScript type name for response body
 * @param responseBody - OpenAPI response body schema object
 * @param operationId - Operation ID from OpenAPI spec
 * @returns TypeScript type name (with [] suffix for arrays) or 'void' if no response body
 */
export function getResponseTypeName(responseBody: any, operationId: string): string {
  if (!responseBody) {
    return 'void';
  }

  if (responseBody.$ref) {
    return getSchemaNameFromRef(responseBody.$ref);
  }

  // Handle array responses
  if (responseBody.type === 'array' && responseBody.items?.$ref) {
    const itemType = getSchemaNameFromRef(responseBody.items.$ref);
    return `${itemType}[]`;
  }

  return `${toPascalCase(operationId)}Response`;
}

/**
 * Enhanced response extraction supporting multiple success status codes
 * @param responses - OpenAPI responses object
 * @returns Schema object from first successful response status code, or undefined
 */
export function extractSchemaFromResponse(responses: any): any {
  for (const status of HTTP_SUCCESS_STATUSES) {
    if (responses[status]?.content?.[CONTENT_TYPE.JSON]?.schema) {
      return responses[status].content[CONTENT_TYPE.JSON].schema;
    }
    if (responses[status] && !responses[status].content) {
      return undefined;
    }
  }

  return undefined;
}
