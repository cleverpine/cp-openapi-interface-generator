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
  MIDDLEWARE_CONFIG: './middleware-config.js'
} as const;

const FOLDER_NAMES = {
  CONTROLLERS: 'controllers',
  MODELS: 'models', 
  ROUTES: 'routes'
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
outputDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

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
            pathParams[resolvedParam.name] = getTypeFromSchema(resolvedParam.schema);
          }
        } else {
          pathParams[param.name] = getTypeFromSchema(param.schema);
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
            queryParams[resolvedParam.name + optional] = getTypeFromSchema(resolvedParam.schema);
          }
        } else {
          const optional = param.required ? '' : '?';
          queryParams[param.name + optional] = getTypeFromSchema(param.schema);
        }
      });

  return queryParams;
}

/**
 * Convert OpenAPI schema to TypeScript type
 */
function getTypeFromSchema(schema: any): string {
  if (!schema) return 'unknown'; // Use 'unknown' instead of 'any' for better type safety

  switch (schema.type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'array':
      const itemType = getTypeFromSchema(schema.items);
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
  if (keys.length > 1 && keys.length <= 3) {
    const paramNames = keys.map(key => {
      const cleanKey = key.replace(/\?$/, ''); // Remove optional marker if present
      return toPascalCase(cleanKey);
    }).join('');
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
        const nestedTypeName = typeCode.match(/(?:export )?(?:interface|type) (\w+)/)?.[1];
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
        const nestedTypeName = typeCode.match(/(?:export )?(?:interface|type) (\w+)/)?.[1];
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
function generateInterface(name: string, schema: any, spec: OpenAPISpec, nestedInterfaces: string[] = [], exportMain = true): string {
  if (!schema || (!schema.properties && !schema.type)) {
    return `${exportMain ? 'export ' : ''}type ${name} = unknown;`;
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

const spec: OpenAPISpec = YAML.load(openApiPath);
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
        queryParams
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
 */
function extractTypeDependencies(typeCode: string): Set<string> {
  const dependencies = new Set<string>();

  // Find all custom type references (exclude primitive types)
  // Pattern 1: property type references like `: SomeType` or `: SomeType[]`
  const typeRefs = typeCode.match(/:\s*([A-Z][a-zA-Z0-9]*(?:\[])?)/g);
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
  const aliasRefs = typeCode.match(/=\s*([A-Z][a-zA-Z0-9]*(?:\[])?)/g);
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

  // Add export to interface or type definitions
  return typeCode.replace(/^(interface|type)\s+/, 'export $1 ');
}

if (allTypes.length > 0) {

  // First pass: create a map of all type names for dependency resolution
  const allTypeNames = new Set<string>();
  allTypes.forEach(typeCode => {
    const typeMatch = typeCode.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
    if (typeMatch) {
      allTypeNames.add(typeMatch[1]);
    }
  });

  allTypes.forEach(typeCode => {
    // Extract the type name from the interface/type definition
    const typeMatch = typeCode.match(/(?:export\s+)?(?:interface|type)\s+(\w+)/);
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

    fs.writeFileSync(modelFilePath, fileContent.join('\n'));
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
    ...modelExports.sort().map(typeName => `export { ${typeName} } from './${typeName}';`)
  ].join('\n');

  const indexFile = path.join(modelsDir, 'index.ts');
  fs.writeFileSync(indexFile, indexContent);
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
    const pathParamsType = Object.keys(pathParams).length > 0
        ? getReusableParamTypeName(pathParams, 'path', `${toPascalCase(fnName)}PathParams`)
        : '{}';

    const queryParamsType = Object.keys(queryParams).length > 0
        ? getReusableParamTypeName(queryParams, 'query', `${toPascalCase(fnName)}QueryParams`)
        : '{}';

    const pathInfo = Object.keys(pathParams).length > 0 ? Object.keys(pathParams).join(', ') : 'none';
    const queryInfo = Object.keys(queryParams).length > 0 ? Object.keys(queryParams).join(', ') : 'none';

    interfaceLines.push(`  ${fnName}(req: Request<${pathParamsType}, ${resType}, ${reqType}, ${queryParamsType}>, res: Response<${resType}>): Promise<void>;`);
  });

  interfaceLines.push(`}`);

  // Write controller interface file
  fs.writeFileSync(interfaceFile, interfaceLines.join('\n'));
});

// Load middleware configuration
let middlewareConfig: any = null;
try {
  middlewareConfig = require(middlewareConfigPath);
  console.log(`✅ Loaded middleware configuration from: ${middlewareConfigPath}`);
} catch (error) {
  console.log(`⚠️  No middleware configuration found at: ${middlewareConfigPath} - routes will be generated without middleware`);
  middlewareConfig = {
    getMiddleware: () => [],
    getMiddlewareImport: () => null
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
    Array.from(usedMiddleware).sort().forEach(middlewareName => {
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
    const routePath = commonPrefix && expressPath.startsWith(commonPrefix)
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
  fs.writeFileSync(routeFile, routeLines.join('\n'));
});

console.log(`Files generated successfully in ${generatedDir}`);