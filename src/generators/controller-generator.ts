/**
 * Controller interface generation
 */

import path from 'path';
import type { PathMethod } from '../types';
import { toPascalCase, toKebabCase } from '../utils/converters';
import { writeFile } from '../utils/file-writer';
import { getRequestTypeName, getResponseTypeName, getReusableParamTypeName } from './parameter-extractor';

/**
 * Generate controller interface file for a tag
 * @param tag - OpenAPI tag name for grouping endpoints
 * @param methods - Array of path methods belonging to this tag
 * @param controllersDir - Directory path where controller files will be generated
 * @param modelsFolder - Folder name for model imports (relative path)
 * @param parameterTypes - Map of parameter signatures to reusable type names
 */
export function generateControllerInterface(
  tag: string,
  methods: PathMethod[],
  controllersDir: string,
  modelsFolder: string,
  parameterTypes: Map<string, string>
): void {
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
        typesUsedInInterface.add(resTypeName.slice(0, -2));
      } else {
        typesUsedInInterface.add(resTypeName);
      }
    }

    // Add parameter types to imports from models
    if (Object.keys(pathParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}PathParams`;
      const reusableTypeName = getReusableParamTypeName(pathParams, 'path', fallbackName, parameterTypes);
      typesUsedInInterface.add(reusableTypeName);
    }

    if (Object.keys(queryParams).length > 0) {
      const fallbackName = `${toPascalCase(fnName)}QueryParams`;
      const reusableTypeName = getReusableParamTypeName(queryParams, 'query', fallbackName, parameterTypes);
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
        ? getReusableParamTypeName(pathParams, 'path', `${toPascalCase(fnName)}PathParams`, parameterTypes)
        : '{}';

    const queryParamsType =
      Object.keys(queryParams).length > 0
        ? getReusableParamTypeName(queryParams, 'query', `${toPascalCase(fnName)}QueryParams`, parameterTypes)
        : '{}';

    interfaceLines.push(
      `  ${fnName}(req: Request<${pathParamsType}, ${resType}, ${reqType}, ${queryParamsType}>, res: Response<${resType}>): Promise<void>;`,
    );
  });

  interfaceLines.push(`}`);

  // Write controller interface file
  writeFile(interfaceFile, interfaceLines.join('\n'));
}
