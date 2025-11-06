/**
 * String conversion utilities
 */

/**
 * Convert string to PascalCase (e.g., "user-name" -> "UserName")
 * @throws Error if input is not a non-empty string
 */
export const toPascalCase = (name: string): string => {
  if (!name || typeof name !== 'string') {
    throw new Error('toPascalCase requires a non-empty string');
  }

  return name
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .replace(/(?:^|\s|_)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s+/g, '');
};

/**
 * Convert string to kebab-case (e.g., "UserName" -> "user-name")
 * @throws Error if input is not a non-empty string
 */
export const toKebabCase = (name: string): string => {
  if (!name || typeof name !== 'string') {
    throw new Error('toKebabCase requires a non-empty string');
  }

  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
};
