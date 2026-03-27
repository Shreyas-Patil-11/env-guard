'use strict';

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

/**
 * Formats an array of validation errors into a colored terminal string.
 * @param {Array<{key: string, message: string, received?: string}>} errors
 * @returns {string}
 */
function formatErrors(errors) {
  const lines = [
    '',
    `${BOLD}${RED}  env-guard: ${errors.length} environment variable error${errors.length > 1 ? 's' : ''} found${RESET}`,
    '',
  ];

  for (const err of errors) {
    lines.push(`  ${YELLOW}✖${RESET}  ${BOLD}${err.key}${RESET}`);
    lines.push(`     ${DIM}→${RESET} ${err.message}`);
    if (err.received !== undefined) {
      lines.push(`     ${DIM}received:${RESET} ${CYAN}"${err.received}"${RESET}`);
    }
    lines.push('');
  }

  lines.push(`  ${DIM}Check your .env file and fix the above issues.${RESET}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Custom error thrown by guard() on validation failure.
 * Contains the full list of errors for programmatic handling.
 */
class EnvValidationError extends Error {
  /**
   * @param {Array<{key: string, message: string, received?: string}>} errors
   */
  constructor(errors) {
    super(formatErrors(errors));
    this.name   = 'EnvValidationError';
    this.errors = errors;
  }
}

module.exports = { EnvValidationError, formatErrors };