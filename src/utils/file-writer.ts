/**
 * File writing utilities with error handling
 */

import fs from 'fs';

/**
 * Write file with error handling (throws on error)
 * @param filePath - Absolute path to the file to write
 * @param content - Content to write to the file
 * @throws Error if file write fails
 */
export function writeFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to write file ${filePath}: ${errorMessage}`);
    throw error; // Re-throw to stop generation
  }
}

/**
 * Ensure directories exist, creating them if necessary
 * @param dirs - Array of directory paths to create
 * @throws Error if directory creation fails
 */
export function ensureDirectories(dirs: string[]): void {
  try {
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to create output directories: ${errorMessage}`);
    throw error; // Throw instead of process.exit for consistent error handling
  }
}
