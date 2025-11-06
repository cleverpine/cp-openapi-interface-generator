import path from 'path';
import fs from 'fs';
import YAML from 'yamljs';
import minimist from 'minimist';

// Constants
const HTTP_SUCCESS_STATUSES = ['200', '201', '202', '204', '205', '206', '207', '208'];
const PRIMITIVE_TYPES = ['String', 'Number', 'Boolean', 'Array', 'Object'];
const DEFAULT_PATHS = {
  OPENAPI: './openapi.yaml',
  GENERATED_DIR: './node_modules/@generated',
  MIDDLEWARE_CONFIG: './middleware-config.js',
} as const;

const FOLDER_NAMES = {
  CONTROLLERS: 'controllers',
  MODELS: 'models',
  ROUTES: 'routes',
} as const;

// Parameter type naming configuration
const MAX_PARAM_NAME_COMBINATION = 3; // Maximum parameters to combine in type name before using fallback

// Regex patterns for type dependency extraction
const TYPE_DEPENDENCY_PATTERNS = {
  PROPERTY_TYPE: /:\s*([A-Z][a-zA-Z0-9]*(?:\[])?)/g,
  TYPE_ALIAS: /=\s*([A-Z][a-zA-Z0-9]*(?:\[])?)/g,
  TYPE_DECLARATION: /(?:export\s+)?(?:interface|type|enum)\s+(\w+)/,
} as const;

interface Args {
  'open-api-path'?: string;
  'generated-dir'?: string;
  'controllers-folder'?: string;
  'models-folder'?: string;
  'routes-folder'?: string;
  'middleware-config-path'?: string;
}

interface OpenAPISpec {
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
  };
}

interface PathMethod {
  fnName: string;
  method: string;
  path: string;
  requestBody?: any;
  responseBody?: any;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
}

const args = minimist(process.argv.slice(2), {
  alias: {
    'open-api-path': 'openApiPath',
    'generated-dir': 'generatedDir',
    'controllers-folder': 'controllersFolder',
    'models-folder': 'modelsFolder',
    'routes-folder': 'routesFolder',
    'middleware-config-path': 'middlewareConfigPath',
  },
}) as Args;

const openApiPath: string = args['open-api-path'] || DEFAULT_PATHS.OPENAPI;
const generatedDir: string = args['generated-dir'] || DEFAULT_PATHS.GENERATED_DIR;
const controllersFolder: string = args['controllers-folder'] || FOLDER_NAMES.CONTROLLERS;
const modelsFolder: string = args['models-folder'] || FOLDER_NAMES.MODELS;
const routesFolder: string = args['routes-folder'] || FOLDER_NAMES.ROUTES;
const middlewareConfigPath: string = path.resolve(args['middleware-config-path'] || DEFAULT_PATHS.MIDDLEWARE_CONFIG);

const controllersDir: string = generatedDir.endsWith('/') ? generatedDir : `${generatedDir}/` + controllersFolder;
const modelsDir: string = generatedDir.endsWith('/') ? generatedDir : `${generatedDir}/` + modelsFolder;
const routesDir: string = generatedDir.endsWith('/') ? generatedDir : `${generatedDir}/` + routesFolder;

console.log(`Generating contracts from OpenAPI spec at ${openApiPath}...`);
console.log(`Generated files will be saved in ${generatedDir}...`);
console.log(`Controller interface files will be saved in ${controllersDir}...`);
console.log(`Model files will be saved in ${modelsDir}...`);
console.log(`Route files will be saved in ${routesDir}...`);

const outputDirs: string[] = [controllersDir, modelsDir, routesDir];
try {
  outputDirs.forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
} catch (error) {
  console.error(`❌ Failed to create output directories: ${error}`);
  process.exit(1);
}

/**
 * Safely write file with error handling
 */
function safeWriteFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content);
  } catch (error: any) {
    console.error(`❌ Failed to write file ${filePath}: ${error.message || error}`);
    throw error; // Re-throw to stop generation
  }
}

/**
 * Convert string to PascalCase (e.g., "user-name" -> "UserName")
 */
const toPascalCase = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/(?:^|\s|_)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s+/g, '');

/**
 * Convert string to kebab-case (e.g., "UserName" -> "user-name")
 */
const toKebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();

/**
 * Resolve OpenAPI $ref reference to actual schema object
 */
function resolveRef(ref: string, spec: OpenAPISpec): any {
  const parts = ref.replace(/^#\//, '').split('/');
  return parts.reduce((acc: any, part: string) => acc?.[part], spec);
}

/**
 * Extract the schema name from a $ref string
 */
function getSchemaNameFromRef(ref: string): string {
  return ref.split('/').pop() || 'Unknown';
}

/**
 * Generate TypeScript type name for request body
 */
function getRequestTypeName(requestBody: any, operationId: string): string {
  if (!requestBody) {
    return 'void';
  }

  if (requestBody.$ref) {
    return getSchemaNameFromRef(requestBody.$ref);
  }

  // // For inline schemas, generate a reasonable name
  // const cleanOpId = operationId.replace(/Controller$/, '');
  return `${toPascalCase(operationId)}Request`;
}

/**
 * Generate TypeScript type name for response body
 */
function getResponseTypeName(responseBody: any, operationId: string): string {
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

  // // For inline schemas, generate a reasonable name
  // const cleanOpId = operationId.replace(/Controller$/, '');
  return `${toPascalCase(operationId)}Response`;
}

/**
 * Extract path parameters from OpenAPI parameters
 */
function extractPathParams(parameters: any[], spec: OpenAPISpec): Record<string, string> {
  if (!parameters) return {};

  const pathParams: Record<string, string> = {};
  parameters
    .filter(param => {
      // Handle both inline parameters and $ref parameters
      if (param.$ref) {
        const resolvedParam = resolveRef(param.$ref, spec);
        return resolvedParam && resolvedParam.in === 'path';
      }
      return param.in === 'path';
    })
    .forEach(param => {
      if (param.$ref) {
        // Resolve $ref parameter
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
 */
function extractQueryParams(parameters: any[], spec: OpenAPISpec): Record<string, string> {
  if (!parameters) return {};

  const queryParams: Record<string, string> = {};
  parameters
    .filter(param => {
      // Handle both inline parameters and $ref parameters
      if (param.$ref) {
        const resolvedParam = resolveRef(param.$ref, spec);
        return resolvedParam && resolvedParam.in === 'query';
      }
      return param.in === 'query';
    })
    .forEach(param => {
      if (param.$ref) {
        // Resolve $ref parameter
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
 * Convert OpenAPI schema to TypeScript type
 * Note: For inline enums in parameters, we generate union types for simplicity.
 * Named enum types are generated separately through the main schema processing.
 */
function getTypeFromSchema(schema: any, spec?: OpenAPISpec): string {
  if (!schema) return 'unknown'; // Use 'unknown' instead of 'any' for better type safety

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
      return 'unknown'; // Use 'unknown' for unhandled schema types
  }
}

/**
 * Generate TypeScript interface from parameter object
 */
function generateParamsInterface(params: Record<string, string>, typeName: string, exportInterface = true): string {
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

/**
 * Create a signature string for parameter deduplication
 */
function createParamSignature(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  return sortedKeys.map(key => `${key}:${params[key]}`).join('|');
}

/**
 * Find or create a reusable parameter type name
 */
function getReusableParamTypeName(params: Record<string, string>, paramType: string, fallbackName: string): string {
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
    const paramName = keys[0].replace(/\?$/, ''); // Remove optional marker if present
    const typeName = `${toPascalCase(paramName)}${toPascalCase(paramType)}Params`;
    parameterTypes.set(typeName, signature);
    return typeName;
  }

  // For multiple parameters, create composite name based on all parameter names
  if (keys.length > 1 && keys.length <= MAX_PARAM_NAME_COMBINATION) {
    const paramNames = keys
      .map(key => {
        const cleanKey = key.replace(/\?$/, ''); // Remove optional marker if present
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
 * Enhanced response extraction supporting multiple success status codes
 * Returns the raw schema (with $ref intact) to preserve reference information
 */
function extractSchemaFromResponse(responses: any): any {
  const successStatuses = HTTP_SUCCESS_STATUSES;

  for (const status of successStatuses) {
    if (responses[status]?.content?.['application/json']?.schema) {
      // Return the raw schema to preserve $ref information
      return responses[status].content['application/json'].schema;
    }
    if (responses[status] && !responses[status].content) {
      return undefined;
    }
  }

  return undefined;
}

// Global type deduplication to prevent duplicate generation
const globalSeenTypes = new Set<string>();
const generatedTypeDefinitions: Record<string, string> = {};

/**
 * Process and generate types for $ref or inline schemas
 */
function processSchemaType(schema: any, typeName: string, spec: OpenAPISpec, allTypes: string[]): void {
  if (!schema) return;

  if (schema.$ref) {
    const resolvedSchema = resolveRef(schema.$ref, spec);
    if (resolvedSchema && !globalSeenTypes.has(typeName)) {
      globalSeenTypes.add(typeName);
      const nestedTypes: string[] = [];
      const mainInterface = generateInterface(typeName, resolvedSchema, spec, nestedTypes, true);
      allTypes.push(mainInterface);

      // Add all nested types
      nestedTypes.forEach(typeCode => {
        const nestedTypeName = typeCode.match(/(?:export )?(?:interface|type|enum) (\w+)/)?.[1];
        if (nestedTypeName && !globalSeenTypes.has(nestedTypeName)) {
          globalSeenTypes.add(nestedTypeName);
          allTypes.push(typeCode);
        }
      });
    }
  } else {
    // For inline types, generate with provided name
    const nestedTypes: string[] = [];
    if (!globalSeenTypes.has(typeName)) {
      globalSeenTypes.add(typeName);
      const mainInterface = generateInterface(typeName, schema, spec, nestedTypes, true);
      allTypes.push(mainInterface);

      // Add all nested types
      nestedTypes.forEach(typeCode => {
        const nestedTypeName = typeCode.match(/(?:export )?(?:interface|type|enum) (\w+)/)?.[1];
        if (nestedTypeName && !globalSeenTypes.has(nestedTypeName)) {
          globalSeenTypes.add(nestedTypeName);
          allTypes.push(typeCode);
        }
      });
    }
  }
}

/**
 * Convert OpenAPI schema value to TypeScript type string
 */
function toTsType(value: any, name: string, nestedInterfaces: string[], spec: OpenAPISpec): string {
  if (value.$ref) {
    const ref = resolveRef(value.$ref, spec);
    if (ref) {
      const typeName = getSchemaNameFromRef(value.$ref);
      if (!globalSeenTypes.has(typeName)) {
        globalSeenTypes.add(typeName);
        const interfaceCode = generateInterface(typeName, ref, spec, nestedInterfaces, true); // Export nested interfaces
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
          const interfaceCode = generateInterface(typeName, ref, spec, nestedInterfaces, true); // Export all nested interfaces
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
 * Sanitize enum key to be a valid TypeScript identifier
 */
function sanitizeEnumKey(value: any, usedKeys: Set<string> = new Set()): string {
  const str = String(value);

  // Convert to valid TypeScript identifier
  let sanitized = str
    // Replace non-alphanumeric chars (except underscore) with underscore
    .replace(/[^a-zA-Z0-9_]/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '');

  // Prepend underscore if starts with number
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  // Fallback if empty after sanitization
  if (!sanitized) {
    sanitized = 'VALUE';
  }

  // Ensure uniqueness by appending numbers if needed
  let uniqueKey = sanitized;
  let counter = 1;
  while (usedKeys.has(uniqueKey)) {
    uniqueKey = `${sanitized}_${counter}`;
    counter++;
  }

  usedKeys.add(uniqueKey);
  return uniqueKey;
}

/**
 * Validate enum varnames array against enum values
 */
function validateEnumVarNames(varNames: any, enumValues: any[]): string[] {
  if (!Array.isArray(varNames) || varNames.length !== enumValues.length) {
    return []; // Return empty to trigger fallback
  }

  const usedNames = new Set<string>();
  const validNames: string[] = [];

  for (const name of varNames) {
    // Check if valid identifier and unique
    if (
      typeof name === 'string' &&
      /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) &&
      !usedNames.has(name)
    ) {
      validNames.push(name);
      usedNames.add(name);
    } else {
      return []; // Invalid name found, use fallback for all
    }
  }

  return validNames;
}

/**
 * Get properly formatted enum value for TypeScript enum
 */
function getEnumValueString(value: any): string {
  // Handle null/undefined - these should not appear in valid OpenAPI enum definitions
  // TypeScript enums cannot have null as a value
  if (value === null || value === undefined) {
    console.warn(`⚠️  Warning: Enum contains null/undefined value, which is invalid. Skipping...`);
    throw new Error('Invalid enum value: null or undefined are not allowed in TypeScript enums');
  }

  // Numbers and booleans don't need quotes
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  // Strings need quotes and proper escaping
  const stringValue = String(value)
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "\\'")     // Escape single quotes
    .replace(/\n/g, '\\n')    // Escape newlines
    .replace(/\r/g, '\\r')    // Escape carriage returns
    .replace(/\t/g, '\\t');   // Escape tabs

  return `'${stringValue}'`;
}

/**
 * Generate TypeScript interface from OpenAPI schema
 */
function generateInterface(
  name: string,
  schema: any,
  spec: OpenAPISpec,
  nestedInterfaces: string[] = [],
  exportMain = true,
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
    const lines = [`${exportMain ? 'export ' : ''}enum ${name} {`];
    const varNames = validateEnumVarNames(schema['x-enum-varnames'], schema.enum);
    const usedKeys = new Set<string>();

    schema.enum.forEach((value: any, index: number) => {
      const comma = index < schema.enum.length - 1 ? ',' : '';
      // Use validated x-enum-varnames if available, otherwise sanitize the value
      const key = varNames[index] || sanitizeEnumKey(value, usedKeys);
      const enumValue = getEnumValueString(value);
      lines.push(`  ${key} = ${enumValue}${comma}`);
    });
    lines.push('}');
    return lines.join('\n');
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

// Load and validate OpenAPI specification
let spec: OpenAPISpec;
try {
  spec = YAML.load(openApiPath);

  // Validate spec structure
  if (!spec || typeof spec !== 'object') {
    throw new Error('Invalid OpenAPI spec: not an object');
  }
  if (!spec.paths || typeof spec.paths !== 'object') {
    throw new Error('Invalid OpenAPI spec: missing or invalid paths');
  }
} catch (error: any) {
  if (error.code === 'ENOENT') {
    console.error(`❌ OpenAPI spec file not found: ${openApiPath}`);
  } else if (error.message?.includes('Invalid OpenAPI')) {
    console.error(`❌ ${error.message}`);
  } else {
    console.error(`❌ Failed to load OpenAPI spec from ${openApiPath}: ${error.message || error}`);
  }
  process.exit(1);
}

const groupedByTag: Record<string, PathMethod[]> = {};

// Process all paths and methods
for (const [route, methods] of Object.entries(spec.paths)) {
  for (const [method, config] of Object.entries(methods)) {
    const fnName = config.operationId;
    const tags = config.tags ?? ['DefaultController'];
    const requestBody = config.requestBody?.content?.['application/json']?.schema;
    const responseBody = config.responses ? extractSchemaFromResponse(config.responses) : undefined;
    const pathParams = extractPathParams(config.parameters, spec);
    const queryParams = extractQueryParams(config.parameters, spec);

    if (!fnName) continue;

    tags.forEach((tag: string) => {
      if (!groupedByTag[tag]) groupedByTag[tag] = [];
      groupedByTag[tag].push({
        fnName,
        method,
        path: route,
        requestBody,
        responseBody,
        pathParams,
        queryParams,
      });
    });
  }
}

//Collect all types needed across all endpoints
const allTypes: string[] = [];
const usedTypes = new Set<string>();
const parameterTypes = new Map<string, string>();

// Reset global tracking for this generation pass
globalSeenTypes.clear();

// First pass: collect all types needed from all endpoints
Object.values(groupedByTag).forEach(methods => {
  methods.forEach(({ fnName, requestBody, responseBody, pathParams, queryParams }) => {
    // Process parameters first to establish reusable types
    if (Object.keys(pathParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}PathParams`;
      const reusableTypeName = getReusableParamTypeName(pathParams, 'path', fallbackName);

      // Generate parameter interface if not already created
      if (!globalSeenTypes.has(reusableTypeName)) {
        globalSeenTypes.add(reusableTypeName);
        const paramInterface = generateParamsInterface(pathParams, reusableTypeName, true);
        allTypes.push(paramInterface);
      }
    }

    if (Object.keys(queryParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}QueryParams`;
      const reusableTypeName = getReusableParamTypeName(queryParams, 'query', fallbackName);

      // Generate parameter interface if not already created
      if (!globalSeenTypes.has(reusableTypeName)) {
        globalSeenTypes.add(reusableTypeName);
        const paramInterface = generateParamsInterface(queryParams, reusableTypeName, true);
        allTypes.push(paramInterface);
      }
    }
    // Track request types
    const reqTypeName = getRequestTypeName(requestBody, fnName);
    if (reqTypeName !== 'void') {
      usedTypes.add(reqTypeName);
      if (requestBody) {
        processSchemaType(requestBody, reqTypeName, spec, allTypes);
      }
    }

    // Track response types
    const resTypeName = getResponseTypeName(responseBody, fnName);
    const baseResTypeName = resTypeName.endsWith('[]') ? resTypeName.slice(0, -2) : resTypeName;

    if (baseResTypeName !== 'void') {
      usedTypes.add(baseResTypeName);

      if (responseBody) {
        // Handle array responses specially
        if (responseBody.type === 'array' && responseBody.items?.$ref) {
          const itemType = getSchemaNameFromRef(responseBody.items.$ref);
          const resolvedItem = resolveRef(responseBody.items.$ref, spec);
          if (resolvedItem) {
            processSchemaType({ $ref: responseBody.items.$ref }, itemType, spec, allTypes);
          }
        } else {
          processSchemaType(responseBody, baseResTypeName, spec, allTypes);
        }
      }
    }
  });
});

// Ensure all generated types are included, including nested ones
Object.values(generatedTypeDefinitions).forEach(typeCode => {
  if (!allTypes.includes(typeCode)) {
    allTypes.push(typeCode);
  }
});

// Generate individual model files (one per type) and a central index file
const generatedModelFiles = new Map<string, string>(); // Track generated files to avoid duplicates
const modelExports: string[] = []; // Track exports for index file

/**
 * Extract dependencies from a type definition
 *
 * Note: Only extracts simple type references. Does not handle:
 * - Generic types (Array<T>)
 * - Union types (A | B)
 * - Intersection types (A & B)
 *
 * This is acceptable since the generator doesn't produce these patterns.
 */
function extractTypeDependencies(typeCode: string): Set<string> {
  const dependencies = new Set<string>();

  // Find all custom type references (exclude primitive types)
  // Pattern 1: property type references like `: SomeType` or `: SomeType[]`
  const typeRefs = typeCode.match(TYPE_DEPENDENCY_PATTERNS.PROPERTY_TYPE);
  if (typeRefs) {
    typeRefs.forEach(ref => {
      const typeName = ref.replace(/:\s*/, '').replace(/\[]$/, '');
      // Only include custom types (start with uppercase and not primitives)
      if (/^[A-Z]/.test(typeName) && !PRIMITIVE_TYPES.includes(typeName)) {
        dependencies.add(typeName);
      }
    });
  }

  // Pattern 2: type alias references like `= SomeType[]` or `= SomeType`
  const aliasRefs = typeCode.match(TYPE_DEPENDENCY_PATTERNS.TYPE_ALIAS);
  if (aliasRefs) {
    aliasRefs.forEach(ref => {
      const typeName = ref.replace(/=\s*/, '').replace(/\[]$/, '');
      // Only include custom types (start with uppercase and not primitives)
      if (/^[A-Z]/.test(typeName) && !PRIMITIVE_TYPES.includes(typeName)) {
        dependencies.add(typeName);
      }
    });
  }

  return dependencies;
}

/**
 * Ensure type definition has export keyword
 */
function ensureExported(typeCode: string): string {
  // If it already has export, return as is
  if (typeCode.includes('export ')) {
    return typeCode;
  }

  // Add export to interface, type, or enum definitions
  return typeCode.replace(/^(interface|type|enum)\s+/, 'export $1 ');
}

if (allTypes.length > 0) {
  // First pass: create a map of all type names for dependency resolution
  const allTypeNames = new Set<string>();
  allTypes.forEach(typeCode => {
    const typeMatch = typeCode.match(TYPE_DEPENDENCY_PATTERNS.TYPE_DECLARATION);
    if (typeMatch) {
      allTypeNames.add(typeMatch[1]);
    }
  });

  allTypes.forEach(typeCode => {
    // Extract the type name from the interface/type/enum definition
    const typeMatch = typeCode.match(TYPE_DEPENDENCY_PATTERNS.TYPE_DECLARATION);
    if (!typeMatch) return;

    const typeName = typeMatch[1];

    // Skip if we've already generated this type
    if (generatedModelFiles.has(typeName)) {
      return;
    }

    // Ensure the type is exported
    const exportedTypeCode = ensureExported(typeCode);

    // Extract dependencies for this type
    const dependencies = extractTypeDependencies(exportedTypeCode);

    // Filter dependencies to only include types that exist in our generated types
    const validDependencies = Array.from(dependencies).filter(dep => allTypeNames.has(dep));

    // Create individual model file
    const modelFileName = `${typeName}.ts`;
    const modelFilePath = path.join(modelsDir, modelFileName);

    // Build file content with imports if needed
    const fileContent: string[] = [];

    // Add header comment
    fileContent.push('/**');
    fileContent.push(` * ${typeName} model - Auto-generated from OpenAPI specification`);
    fileContent.push(' */');
    fileContent.push('');

    // Add imports for dependencies
    if (validDependencies.length > 0) {
      validDependencies.sort().forEach(dep => {
        fileContent.push(`import { ${dep} } from './${dep}';`);
      });
      fileContent.push('');
    }

    // Add the type definition
    fileContent.push(exportedTypeCode);

    safeWriteFile(modelFilePath, fileContent.join('\n'));
    generatedModelFiles.set(typeName, modelFileName);
    modelExports.push(typeName);
  });

  // Generate index file that exports all models
  const indexContent = [
    `/**`,
    ` * Models index - Auto-generated exports from OpenAPI specification`,
    ` * Generated by generate.ts`,
    ` */`,
    ``,
    ...modelExports.sort().map(typeName => `export { ${typeName} } from './${typeName}';`),
  ].join('\n');

  const indexFile = path.join(modelsDir, 'index.ts');
  safeWriteFile(indexFile, indexContent);
}

// Generate controller interfaces for each tag with imports from models
Object.entries(groupedByTag).forEach(([tag, methods]) => {
  const interfaceName = `${toPascalCase(tag)}Interface`;
  const fileBase = toKebabCase(tag);
  const interfaceFile = path.join(controllersDir, `${fileBase}-interface.ts`);

  const interfaceLines: string[] = [];
  const typesUsedInInterface = new Set<string>();

  interfaceLines.push(`import { Request, Response } from 'express';`);

  // Collect types used in this interface (including parameter types)
  methods.forEach(({ fnName, requestBody, responseBody, pathParams, queryParams }) => {
    const reqTypeName = getRequestTypeName(requestBody, fnName);
    const resTypeName = getResponseTypeName(responseBody, fnName);

    if (reqTypeName !== 'void') typesUsedInInterface.add(reqTypeName);
    if (resTypeName !== 'void') {
      if (resTypeName.endsWith('[]')) {
        typesUsedInInterface.add(resTypeName.slice(0, -2)); // Add base type for arrays
      } else {
        typesUsedInInterface.add(resTypeName);
      }
    }

    // Add parameter types to imports from models
    if (Object.keys(pathParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}PathParams`;
      const reusableTypeName = getReusableParamTypeName(pathParams, 'path', fallbackName);
      typesUsedInInterface.add(reusableTypeName);
    }

    if (Object.keys(queryParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}QueryParams`;
      const reusableTypeName = getReusableParamTypeName(queryParams, 'query', fallbackName);
      typesUsedInInterface.add(reusableTypeName);
    }
  });

  // Import needed types from models (including parameter types)
  if (typesUsedInInterface.size > 0) {
    const importedTypes = Array.from(typesUsedInInterface).sort();
    interfaceLines.push(`import { ${importedTypes.join(', ')} } from '../${modelsFolder}';`);
  }

  interfaceLines.push('');

  interfaceLines.push(`export interface ${interfaceName} {`);

  methods.forEach(({ fnName, requestBody, responseBody, pathParams, queryParams }) => {
    const reqTypeName = getRequestTypeName(requestBody, fnName);
    const resTypeName = getResponseTypeName(responseBody, fnName);

    const reqType = reqTypeName === 'void' ? 'void' : reqTypeName;
    const resType = resTypeName === 'void' ? 'void' : resTypeName;

    // Determine path and query parameter types (use reusable names)
    const pathParamsType =
      Object.keys(pathParams).length > 0
        ? getReusableParamTypeName(pathParams, 'path', `${toPascalCase(fnName)}PathParams`)
        : '{}';

    const queryParamsType =
      Object.keys(queryParams).length > 0
        ? getReusableParamTypeName(queryParams, 'query', `${toPascalCase(fnName)}QueryParams`)
        : '{}';

    interfaceLines.push(
      `  ${fnName}(req: Request<${pathParamsType}, ${resType}, ${reqType}, ${queryParamsType}>, res: Response<${resType}>): Promise<void>;`,
    );
  });

  interfaceLines.push(`}`);

  // Write controller interface file
  safeWriteFile(interfaceFile, interfaceLines.join('\n'));
});

// Load middleware configuration
let middlewareConfig: any = null;
try {
  middlewareConfig = require(middlewareConfigPath);

  // Validate expected methods exist
  if (
    typeof middlewareConfig.getMiddleware !== 'function' ||
    typeof middlewareConfig.getMiddlewareImport !== 'function'
  ) {
    throw new Error('Invalid middleware config: missing required methods (getMiddleware, getMiddlewareImport)');
  }

  console.log(`✅ Loaded middleware configuration from: ${middlewareConfigPath}`);
} catch (error: any) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log(
      `⚠️  No middleware configuration found at: ${middlewareConfigPath} - routes will be generated without middleware`,
    );
  } else {
    console.error(`❌ Error loading middleware config: ${error.message || error}`);
    console.log(`⚠️  Continuing without middleware configuration...`);
  }

  middlewareConfig = {
    getMiddleware: () => [],
    getMiddlewareImport: () => null,
  };
}

/**
 * Convert OpenAPI path to Express route path
 * /messages/{conversationId}/{messageId} -> /messages/:conversationId/:messageId
 */
function convertPathToExpressRoute(openApiPath: string): string {
  return openApiPath.replace(/{([^}]+)}/g, ':$1');
}

/**
 * Find the common path prefix for a group of paths
 * This helps determine what prefix to remove when mounting routes
 */
function findCommonPathPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) {
    // For single path, extract the first segment
    const segments = paths[0].split('/').filter(s => s && !s.includes('{'));
    return segments.length > 0 ? `/${segments[0]}` : '';
  }

  // Find common prefix among all paths
  const pathSegments = paths.map(p => p.split('/').filter(s => s && !s.includes('{')));
  let commonPrefix = '';

  if (pathSegments.every(segments => segments.length > 0 && segments[0] === pathSegments[0][0])) {
    commonPrefix = `/${pathSegments[0][0]}`;
  }

  return commonPrefix;
}

/**
 * Generate route file for each tag
 */
Object.entries(groupedByTag).forEach(([tag, methods]) => {
  const fileBase = toKebabCase(tag);
  const routeFile = path.join(routesDir, `${fileBase}-routes.ts`);
  const interfaceName = `${toPascalCase(tag)}Interface`;
  const controllerName = `${toPascalCase(tag).toLowerCase()}Controller`;

  const routeLines: string[] = [];
  const usedMiddleware = new Set<string>();

  // Header and imports
  routeLines.push(`/**`);
  routeLines.push(` * Auto-generated ${tag} routes from OpenAPI specification`);
  routeLines.push(` * Generated by generate.ts`);
  routeLines.push(` */`);
  routeLines.push('');
  routeLines.push(`import { Router } from 'express';`);
  routeLines.push(`import { ${interfaceName} } from '../${controllersFolder}/${fileBase}-interface';`);
  routeLines.push('');

  // Collect middleware used in this file
  methods.forEach(({ fnName, method }) => {
    const middleware = middlewareConfig.getMiddleware(fnName, method.toUpperCase(), [tag]);
    middleware.forEach((mw: string) => usedMiddleware.add(mw));
  });

  // Import middleware
  if (usedMiddleware.size > 0) {
    routeLines.push(`// Middleware imports`);
    Array.from(usedMiddleware)
      .sort()
      .forEach(middlewareName => {
        const importStatement = middlewareConfig.getMiddlewareImport(middlewareName);
        routeLines.push(`const ${middlewareName} = ${importStatement};`);
      });
    routeLines.push('');
  }

  // Router setup - using dependency injection pattern
  routeLines.push(`const router = Router();`);
  routeLines.push('');
  routeLines.push(`// Controller instance should be injected from outside`);
  routeLines.push(`// Example: const router = createRoutes(${controllerName});`);
  routeLines.push(`export function createRoutes(${controllerName}: ${interfaceName}): Router {`);
  routeLines.push(`  const router = Router();`);
  routeLines.push('');

  // Determine the common path prefix for this tag's routes
  const allPaths = methods.map(({ path }) => path);
  const commonPrefix = findCommonPathPrefix(allPaths);

  // Generate routes for each method
  methods.forEach(({ fnName, method, path }) => {
    const expressPath = convertPathToExpressRoute(path);

    // Remove the common prefix from the path since it will be mounted at /api/{prefix}
    const routePath =
      commonPrefix && expressPath.startsWith(commonPrefix)
        ? expressPath.slice(commonPrefix.length) || '/'
        : expressPath;

    const middleware = middlewareConfig.getMiddleware(fnName, method.toUpperCase(), [tag]);

    // Build route definition
    const middlewareChain = middleware.length > 0 ? middleware.join(', ') + ', ' : '';
    const routeDefinition = `  router.${method.toLowerCase()}('${routePath}', ${middlewareChain}${controllerName}.${fnName}.bind(${controllerName}));`;

    // Add comments for clarity
    routeLines.push(`// ${method.toUpperCase()} ${path} - ${fnName}`);
    routeLines.push(routeDefinition);
    routeLines.push('');
  });

  // Return the configured router
  routeLines.push(`  return router;`);
  routeLines.push(`}`);

  // Write route file
  safeWriteFile(routeFile, routeLines.join('\n'));
});

console.log(`Files generated successfully in ${generatedDir}`);
