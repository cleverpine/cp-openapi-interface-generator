/**
 * File writing utilities with error handling
 */

import fs from 'fs';

/**
 * Write file with error handling (throws on error)
 */
export function writeFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content);
  } catch (error: any) {
    console.error(`Failed to write file ${filePath}: ${error.message || error}`);
    throw error; // Re-throw to stop generation
  }
}

/**
 * Ensure directories exist, creating them if necessary
 */
export function ensureDirectories(dirs: string[]): void {
  try {
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  } catch (error) {
    console.error(`Failed to create output directories: ${error}`);
    process.exit(1);
  }
}
