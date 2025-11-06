/**
 * Configuration constants for the OpenAPI generator
 */

export const HTTP_SUCCESS_STATUSES = ['200', '201', '202', '204', '205', '206', '207', '208'];

export const PRIMITIVE_TYPES = ['String', 'Number', 'Boolean', 'Array', 'Object'];

export const DEFAULT_PATHS = {
  OPENAPI: './openapi.yaml',
  GENERATED_DIR: './node_modules/@generated',
  MIDDLEWARE_CONFIG: './middleware-config.js',
} as const;

export const FOLDER_NAMES = {
  CONTROLLERS: 'controllers',
  MODELS: 'models',
  ROUTES: 'routes',
} as const;

// Parameter type naming configuration
export const MAX_PARAM_NAME_COMBINATION = 3; // Maximum parameters to combine in type name before using fallback

// Regex patterns for type dependency extraction
export const TYPE_DEPENDENCY_PATTERNS = {
  PROPERTY_TYPE: /:\s*([A-Z][a-zA-Z0-9]*(?:\[])?)/g,
  TYPE_ALIAS: /=\s*([A-Z][a-zA-Z0-9]*(?:\[])?)/g,
  TYPE_DECLARATION: /(?:export\s+)?(?:interface|type|enum)\s+(\w+)/,
} as const;
