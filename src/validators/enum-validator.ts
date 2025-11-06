/**
 * Enum validation utilities
 */

/**
 * Validate enum varnames array against enum values
 */
export function validateEnumVarNames(varNames: any, enumValues: any[]): string[] {
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
 * Sanitize enum key to be a valid TypeScript identifier
 */
export function sanitizeEnumKey(value: any, usedKeys: Set<string> = new Set()): string {
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
 * Get properly formatted enum value for TypeScript enum
 */
export function getEnumValueString(value: any): string {
  // Handle null/undefined - these should not appear in valid OpenAPI enum definitions
  // TypeScript enums cannot have null as a value
  if (value === null || value === undefined) {
    console.error(`Invalid enum value: null or undefined are not allowed in TypeScript enums`);
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
