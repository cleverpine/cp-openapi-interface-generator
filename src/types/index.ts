/**
 * TypeScript type definitions for the OpenAPI generator
 */

export interface Args {
  'open-api-path'?: string;
  'generated-dir'?: string;
  'controllers-folder'?: string;
  'models-folder'?: string;
  'routes-folder'?: string;
  'middleware-config-path'?: string;
}

export interface OpenAPISpec {
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
  };
}

export interface PathMethod {
  fnName: string;
  method: string;
  path: string;
  requestBody?: any;
  responseBody?: any;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
}

export interface MiddlewareConfig {
  getMiddleware: (fnName: string, method: string, tags: string[]) => string[];
  getMiddlewareImport: (middlewareName: string) => string | null;
}
