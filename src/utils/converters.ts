/**
 * String conversion utilities
 */

/**
 * Convert string to PascalCase (e.g., "user-name" -> "UserName")
 */
export const toPascalCase = (name: string): string =>
  name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/(?:^|\s|_)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s+/g, '');

/**
 * Convert string to kebab-case (e.g., "UserName" -> "user-name")
 */
export const toKebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
