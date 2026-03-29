'use strict';

/**
 * env-guard — Runtime .env validation
 * Zero dependencies. Works in any Node.js framework.
 *
 * exports:
 *   guard(schema, options)        → validated env object (throws on error)
 *   safeGuard(schema, options)    → { success, data } | { success: false, errors }
 *   guardAsync(schema, options)   → Promise<validated env> (supports async custom validators)
 *   generateExample(schema, path) → writes .env.example
 *   EnvValidationError            → error class with .errors array
 */

const path = require('path');
const { parseEnvFile, generateEnvExample }        = require('./parser');
const { validateField, validateFieldAsync }        = require('./validator');
const { EnvValidationError, formatErrors }         = require('./errors');

// ─── Browser / Edge guard ─────────────────────────────────────────────────────

const isServer = typeof window === 'undefined' && typeof process !== 'undefined' && process.versions != null;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function resolveOptions(options) {
  const {
    envPath,
    failFast    = false,
    exitOnError = false,
    overrides   = {},
  } = options;

  const resolvedEnvPath =
    envPath === false
      ? undefined
      : envPath || (isServer ? path.resolve(process.cwd(), '.env') : undefined);

  return { resolvedEnvPath, failFast, exitOnError, overrides };
}

function buildMergedEnv(resolvedEnvPath, overrides) {
  const fileEnv = resolvedEnvPath ? parseEnvFile(resolvedEnvPath) : {};
  // Merge order: file < process.env < overrides (overrides win in tests)
  return Object.assign({}, fileEnv, isServer ? process.env : {}, overrides);
}

function handleErrors(errors, exitOnError) {
  if (exitOnError && isServer) {
    process.stderr.write(formatErrors(errors) + '\n');
    process.exit(1);
  }
  throw new EnvValidationError(errors);
}

// ─── guard() — synchronous ────────────────────────────────────────────────────

/**
 * Validate environment variables against a schema. Throws on failure.
 *
 * @param {Record<string, {
 *   type: 'string'|'number'|'boolean'|'url'|'email'|'port'|'json',
 *   description?: string,
 *   required?: boolean,
 *   default?: any,
 *   example?: string,
 *   enum?: string[],
 *   minLength?: number,
 *   maxLength?: number,
 *   pattern?: RegExp,
 *   min?: number,
 *   max?: number,
 *   protocols?: string[],
 *   custom?: (value: any) => boolean | string | null | undefined,
 * }>} schema
 *
 * @param {{
 *   envPath?: string | false,
 *   failFast?: boolean,
 *   exitOnError?: boolean,
 *   overrides?: Record<string, string>,
 * }} [options]
 *
 * @returns {Record<string, any>}
 *
 * @example
 * const env = guard({
 *   PORT:         { type: 'port',    default: 3000 },
 *   DATABASE_URL: { type: 'url',     description: 'PostgreSQL URL' },
 *   DEBUG:        { type: 'boolean', default: false },
 * }, { exitOnError: true });
 */
function guard(schema, options = {}) {
  // Non-server environments: skip validation, return process.env as-is
  if (!isServer) return (typeof process !== 'undefined' ? process.env : {});

  const { resolvedEnvPath, failFast, exitOnError, overrides } = resolveOptions(options);
  const merged = buildMergedEnv(resolvedEnvPath, overrides);

  const result = {};
  const errors = [];

  for (const [key, field] of Object.entries(schema)) {
    const { value, error } = validateField(key, merged[key], field);
    if (error) {
      errors.push(error);
      if (failFast) break;
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  if (errors.length > 0) handleErrors(errors, exitOnError);
  return result;
}

// ─── guardAsync() — async custom validators ───────────────────────────────────

/**
 * Async version of guard(). Supports async custom() validators.
 * Useful for validating API keys, checking DB connectivity, etc.
 *
 * @param {Parameters<typeof guard>[0]} schema
 * @param {Parameters<typeof guard>[1]} [options]
 * @returns {Promise<Record<string, any>>}
 *
 * @example
 * const env = await guardAsync({
 *   API_KEY: {
 *     type: 'string',
 *     custom: async (v) => {
 *       const ok = await verifyKeyWithServer(v);
 *       return ok || 'API_KEY is invalid or expired';
 *     }
 *   }
 * });
 */
async function guardAsync(schema, options = {}) {
  if (!isServer) return (typeof process !== 'undefined' ? process.env : {});

  const { resolvedEnvPath, failFast, exitOnError, overrides } = resolveOptions(options);
  const merged = buildMergedEnv(resolvedEnvPath, overrides);

  const result = {};
  const errors = [];

  for (const [key, field] of Object.entries(schema)) {
    const { value, error } = await validateFieldAsync(key, merged[key], field);
    if (error) {
      errors.push(error);
      if (failFast) break;
    } else if (value !== undefined) {
      result[key] = value;
    }
  }

  if (errors.length > 0) handleErrors(errors, exitOnError);
  return result;
}

// ─── safeGuard() — no-throw wrapper ──────────────────────────────────────────

/**
 * Like guard(), but returns a result object instead of throwing.
 *
 * @param {Parameters<typeof guard>[0]} schema
 * @param {Omit<Parameters<typeof guard>[1], 'exitOnError'>} [options]
 * @returns {{ success: true, data: object } | { success: false, errors: object[] }}
 */
function safeGuard(schema, options = {}) {
  try {
    const data = guard(schema, { ...options, exitOnError: false });
    return { success: true, data };
  } catch (err) {
    if (err instanceof EnvValidationError) {
      return { success: false, errors: err.errors };
    }
    throw err;
  }
}

/**
 * Async version of safeGuard(). Supports async custom() validators.
 *
 * @param {Parameters<typeof guard>[0]} schema
 * @param {Parameters<typeof safeGuard>[1]} [options]
 * @returns {Promise<{ success: true, data: object } | { success: false, errors: object[] }>}
 */
async function safeGuardAsync(schema, options = {}) {
  try {
    const data = await guardAsync(schema, { ...options, exitOnError: false });
    return { success: true, data };
  } catch (err) {
    if (err instanceof EnvValidationError) {
      return { success: false, errors: err.errors };
    }
    throw err;
  }
}

// ─── generateExample() ───────────────────────────────────────────────────────

/**
 * Write a .env.example from a schema without validating anything.
 *
 * @param {Parameters<typeof guard>[0]} schema
 * @param {string} [outputPath='.env.example']
 * @returns {string} File contents
 */
function generateExample(schema, outputPath = '.env.example') {
  return generateEnvExample(schema, outputPath);
}

module.exports = { guard, safeGuard, guardAsync, safeGuardAsync, generateExample, EnvValidationError };