/**
 * Model file generation from TypeScript type definitions
 */

import path from 'path';
import { writeFile } from '../utils/file-writer';
import { PRIMITIVE_TYPES, TYPE_DEPENDENCY_PATTERNS, FILE_HEADERS } from '../config/constants';

/**
 * Extract dependencies from a type definition
 *
 * Note: Only extracts simple type references. Does not handle:
 * - Generic types (Array<T>)
 * - Union types (A | B)
 * - Intersection types (A & B)
 *
 * This is acceptable since the generator doesn't produce these patterns.
 *
 * @param typeCode - TypeScript type definition code
 * @returns Set of type names that this type depends on
 */
export function extractTypeDependencies(typeCode: string): Set<string> {
  const dependencies = new Set<string>();

  // Find all custom type references (exclude primitive types)
  // Pattern 1: property type references like `: SomeType` or `: SomeType[]`
  const typeRefs = typeCode.match(TYPE_DEPENDENCY_PATTERNS.PROPERTY_TYPE);
  if (typeRefs) {
    typeRefs.forEach(ref => {
      const typeName = ref.replace(/:\s*/, '').replace(/\[]$/, '');
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
      if (/^[A-Z]/.test(typeName) && !PRIMITIVE_TYPES.includes(typeName)) {
        dependencies.add(typeName);
      }
    });
  }

  return dependencies;
}

/**
 * Ensure type definition has export keyword
 * @param typeCode - TypeScript type definition code
 * @returns Type definition with export keyword prepended if not present
 */
export function ensureExported(typeCode: string): string {
  if (typeCode.includes('export ')) {
    return typeCode;
  }
  return typeCode.replace(/^(interface|type|enum)\s+/, 'export $1 ');
}

/**
 * Generate individual model files and index
 * @param allTypes - Array of TypeScript type definition strings
 * @param modelsDir - Directory path where model files will be generated
 */
export function generateModelFiles(allTypes: string[], modelsDir: string): void {
  const generatedModelFiles = new Map<string, string>();
  const modelExports: string[] = [];

  if (allTypes.length === 0) return;

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
    fileContent.push(FILE_HEADERS.MODEL(typeName));
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

    writeFile(modelFilePath, fileContent.join('\n'));
    generatedModelFiles.set(typeName, modelFileName);
    modelExports.push(typeName);
  });

  // Generate index file that exports all models
  const indexContent = [
    FILE_HEADERS.MODELS_INDEX,
    ``,
    ...modelExports.sort().map(typeName => `export { ${typeName} } from './${typeName}';`),
  ].join('\n');

  const indexFile = path.join(modelsDir, 'index.ts');
  writeFile(indexFile, indexContent);
}
