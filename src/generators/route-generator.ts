/**
 * Express route generation
 */

import path from 'path';
import type { PathMethod, MiddlewareConfig } from '../types';
import { toPascalCase, toKebabCase } from '../utils/converters';
import { writeFile } from '../utils/file-writer';
import { FILE_HEADERS } from '../config/constants';

/**
 * Convert OpenAPI path to Express route path
 * /messages/{conversationId}/{messageId} -> /messages/:conversationId/:messageId
 * @param openApiPath - OpenAPI path with {param} syntax
 * @returns Express route path with :param syntax
 */
export function convertPathToExpressRoute(openApiPath: string): string {
  return openApiPath.replace(/{([^}]+)}/g, ':$1');
}

/**
 * Find the common path prefix for a group of paths
 * @param paths - Array of path strings to analyze
 * @returns Common prefix path (e.g., "/messages") or empty string if none
 */
export function findCommonPathPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) {
    const segments = paths[0].split('/').filter(s => s && !s.includes('{'));
    return segments.length > 0 ? `/${segments[0]}` : '';
  }

  const pathSegments = paths.map(p => p.split('/').filter(s => s && !s.includes('{')));
  let commonPrefix = '';

  if (pathSegments.every(segments => segments.length > 0 && segments[0] === pathSegments[0][0])) {
    commonPrefix = `/${pathSegments[0][0]}`;
  }

  return commonPrefix;
}

/**
 * Generate route file for a tag
 * @param tag - OpenAPI tag name for grouping endpoints
 * @param methods - Array of path methods belonging to this tag
 * @param routesDir - Directory path where route files will be generated
 * @param controllersFolder - Folder name for controller imports (relative path)
 * @param middlewareConfig - Configuration object for middleware generation
 */
export function generateRouteFile(
  tag: string,
  methods: PathMethod[],
  routesDir: string,
  controllersFolder: string,
  middlewareConfig: MiddlewareConfig
): void {
  const fileBase = toKebabCase(tag);
  const routeFile = path.join(routesDir, `${fileBase}-routes.ts`);
  const interfaceName = `${toPascalCase(tag)}Interface`;
  const controllerName = `${toPascalCase(tag).toLowerCase()}Controller`;

  const routeLines: string[] = [];
  const usedMiddleware = new Set<string>();

  // Header and imports
  routeLines.push(FILE_HEADERS.ROUTES(tag));
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
        // Skip middleware if import statement is null
        if (importStatement) {
          routeLines.push(`const ${middlewareName} = ${importStatement};`);
        }
      });
    routeLines.push('');
  }

  // Router setup - using dependency injection pattern
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
  writeFile(routeFile, routeLines.join('\n'));
}
