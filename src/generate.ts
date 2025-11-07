/**
 * Main OpenAPI to TypeScript generator orchestrator
 */

import path from 'path';
import YAML from 'yamljs';
import minimist from 'minimist';

// Import types
import type { Args, OpenAPISpec, PathMethod, MiddlewareConfig } from './types';

// Import constants
import { DEFAULT_PATHS, FOLDER_NAMES, CONTENT_TYPE } from './config/constants';

// Import utilities
import { ensureDirectories } from './utils/file-writer';
import { resolveRef } from './utils/openapi-resolver';
import { toPascalCase } from './utils/converters';

// Import generators
import {
  resetGeneratorState,
  generateInterface,
  generateParamsInterface,
  getGeneratedTypeDefinitions,
} from './generators/interface-generator';
import { generateModelFiles } from './generators/model-generator';
import { generateControllerInterface } from './generators/controller-generator';
import { generateRouteFile } from './generators/route-generator';
import {
  extractPathParams,
  extractQueryParams,
  getRequestTypeName,
  getResponseTypeName,
  extractSchemaFromResponse,
  getReusableParamTypeName,
} from './generators/parameter-extractor';

// Parse command line arguments
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
const middlewareConfigPath: string = path.resolve(
  args['middleware-config-path'] || DEFAULT_PATHS.MIDDLEWARE_CONFIG
);

const controllersDir: string = generatedDir.endsWith('/') ? generatedDir : `${generatedDir}/` + controllersFolder;
const modelsDir: string = generatedDir.endsWith('/') ? generatedDir : `${generatedDir}/` + modelsFolder;
const routesDir: string = generatedDir.endsWith('/') ? generatedDir : `${generatedDir}/` + routesFolder;

console.log(`Generating contracts from OpenAPI spec at ${openApiPath}...`);
console.log(`Generated files will be saved in ${generatedDir}...`);
console.log(`Controller interface files will be saved in ${controllersDir}...`);
console.log(`Model files will be saved in ${modelsDir}...`);
console.log(`Route files will be saved in ${routesDir}...`);

// Ensure output directories exist
ensureDirectories([controllersDir, modelsDir, routesDir]);

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
    console.error(`OpenAPI spec file not found: ${openApiPath}`);
  } else if (error.message?.includes('Invalid OpenAPI')) {
    console.error(`${error.message}`);
  } else {
    console.error(`Failed to load OpenAPI spec from ${openApiPath}: ${error.message || error}`);
  }
  process.exit(1);
}

// Reset generator state to prevent contamination from previous runs
resetGeneratorState();

// Group endpoints by tag
const groupedByTag: Record<string, PathMethod[]> = {};

// Process all paths and methods
for (const [route, methods] of Object.entries(spec.paths)) {
  for (const [method, config] of Object.entries(methods)) {
    const fnName = config.operationId;
    const tags = config.tags ?? ['DefaultController'];
    const requestBody = config.requestBody?.content?.[CONTENT_TYPE.JSON]?.schema;
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

// Collect all types needed across all endpoints
const allTypes: string[] = [];
const collectedTypeNames = new Set<string>(); // Track type names for O(1) deduplication
const parameterTypes = new Map<string, string>();

// First pass: collect all parameter types
Object.values(groupedByTag).forEach(methods => {
  methods.forEach(({ fnName, pathParams, queryParams }) => {
    // Process path parameters
    if (Object.keys(pathParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}PathParams`;
      const reusableTypeName = getReusableParamTypeName(pathParams, 'path', fallbackName, parameterTypes);

      // Check if we need to generate this parameter type
      if (!collectedTypeNames.has(reusableTypeName)) {
        const paramInterface = generateParamsInterface(pathParams, reusableTypeName, true);
        allTypes.push(paramInterface);
        collectedTypeNames.add(reusableTypeName);
      }
    }

    // Process query parameters
    if (Object.keys(queryParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}QueryParams`;
      const reusableTypeName = getReusableParamTypeName(queryParams, 'query', fallbackName, parameterTypes);

      // Check if we need to generate this parameter type
      if (!collectedTypeNames.has(reusableTypeName)) {
        const paramInterface = generateParamsInterface(queryParams, reusableTypeName, true);
        allTypes.push(paramInterface);
        collectedTypeNames.add(reusableTypeName);
      }
    }
  });
});

// Second pass: collect all request/response types
Object.values(groupedByTag).forEach(methods => {
  methods.forEach(({ fnName, requestBody, responseBody }) => {
    // Process request types
    const reqTypeName = getRequestTypeName(requestBody, fnName);
    if (reqTypeName !== 'void' && requestBody) {
      // Resolve $ref if present
      const resolvedRequestBody = requestBody.$ref ? resolveRef(requestBody.$ref, spec) : requestBody;

      const nestedTypes: string[] = [];
      const mainInterface = generateInterface(reqTypeName, resolvedRequestBody, spec, nestedTypes, true);

      // Only add if not already present
      if (!collectedTypeNames.has(reqTypeName)) {
        allTypes.push(mainInterface);
        collectedTypeNames.add(reqTypeName);
        nestedTypes.forEach(nt => {
          const typeName = nt.match(/(?:interface|type|enum)\s+(\w+)/)?.[1];
          if (typeName && !collectedTypeNames.has(typeName)) {
            allTypes.push(nt);
            collectedTypeNames.add(typeName);
          }
        });
      }
    }

    // Process response types
    const resTypeName = getResponseTypeName(responseBody, fnName);
    const baseResTypeName = resTypeName.endsWith('[]') ? resTypeName.slice(0, -2) : resTypeName;

    if (baseResTypeName !== 'void' && responseBody) {
      // Resolve $ref if present at the top level
      const resolvedResponseBody = responseBody.$ref ? resolveRef(responseBody.$ref, spec) : responseBody;

      // Handle array responses
      if (resolvedResponseBody.type === 'array' && resolvedResponseBody.items?.$ref) {
        const resolvedItem = resolveRef(resolvedResponseBody.items.$ref, spec);
        if (resolvedItem) {
          const nestedTypes: string[] = [];
          const mainInterface = generateInterface(baseResTypeName, resolvedItem, spec, nestedTypes, true);

          if (!collectedTypeNames.has(baseResTypeName)) {
            allTypes.push(mainInterface);
            collectedTypeNames.add(baseResTypeName);
            nestedTypes.forEach(nt => {
              const typeName = nt.match(/(?:interface|type|enum)\s+(\w+)/)?.[1];
              if (typeName && !collectedTypeNames.has(typeName)) {
                allTypes.push(nt);
                collectedTypeNames.add(typeName);
              }
            });
          }
        }
      } else {
        const nestedTypes: string[] = [];
        const mainInterface = generateInterface(baseResTypeName, resolvedResponseBody, spec, nestedTypes, true);

        if (!collectedTypeNames.has(baseResTypeName)) {
          allTypes.push(mainInterface);
          collectedTypeNames.add(baseResTypeName);
          nestedTypes.forEach(nt => {
            const typeName = nt.match(/(?:interface|type|enum)\s+(\w+)/)?.[1];
            if (typeName && !collectedTypeNames.has(typeName)) {
              allTypes.push(nt);
              collectedTypeNames.add(typeName);
            }
          });
        }
      }
    }
  });
});

// Ensure all generated types are included, including nested ones discovered during $ref resolution
const generatedTypeDefinitions = getGeneratedTypeDefinitions();
Object.values(generatedTypeDefinitions).forEach(typeCode => {
  if (!allTypes.includes(typeCode)) {
    allTypes.push(typeCode);
  }
});

// Generate model files from collected types
generateModelFiles(allTypes, modelsDir);

// Generate controller interfaces for each tag
Object.entries(groupedByTag).forEach(([tag, methods]) => {
  generateControllerInterface(tag, methods, controllersDir, modelsFolder, parameterTypes);
});

// Load middleware configuration
let middlewareConfig: MiddlewareConfig;
try {
  const loadedConfig = require(middlewareConfigPath);

  // Validate expected methods exist
  if (
    typeof loadedConfig.getMiddleware !== 'function' ||
    typeof loadedConfig.getMiddlewareImport !== 'function'
  ) {
    throw new Error('Invalid middleware config: missing required methods (getMiddleware, getMiddlewareImport)');
  }

  console.log(`Loaded middleware configuration from: ${middlewareConfigPath}`);
  middlewareConfig = loadedConfig;
} catch (error) {
  // Default middleware config with no middleware
  middlewareConfig = {
    getMiddleware: () => [],
    getMiddlewareImport: () => null,
  };

  // Check if it's a module not found error vs other errors
  if (error && typeof error === 'object' && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
    console.log(
      `No middleware configuration found at: ${middlewareConfigPath} - routes will be generated without middleware`
    );
  } else {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error loading middleware config: ${errorMessage}`);
    console.log(`Continuing without middleware configuration...`);
  }
}

// Generate route files for each tag
Object.entries(groupedByTag).forEach(([tag, methods]) => {
  generateRouteFile(tag, methods, routesDir, controllersFolder, middlewareConfig);
});

console.log(`Files generated successfully in ${generatedDir}`);
