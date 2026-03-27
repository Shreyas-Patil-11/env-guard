'use strict';

// ─── Secret key detection ─────────────────────────────────────────────────────

const SECRET_KEY_PATTERN = /secret|token|key|password|passwd|pwd|auth|credential/i;

/**
 * Mask a value if the key looks like a sensitive field.
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function maskIfSensitive(key, value) {
  if (!SECRET_KEY_PATTERN.test(key)) return value;
  if (value.length <= 4) return '****';
  return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 4, 8));
}

// ─── Type coercions ───────────────────────────────────────────────────────────

function coerceBoolean(raw) {
  const lower = raw.toLowerCase().trim();
  if (['true', '1', 'yes', 'on'].includes(lower))  return { value: true };
  if (['false', '0', 'no', 'off'].includes(lower)) return { value: false };
  return null;
}

function coerceNumber(raw) {
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUrl(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

// ─── Per-type validators ──────────────────────────────────────────────────────

function validateString(key, raw, field) {
  if (field.enum && !field.enum.includes(raw)) {
    return { error: { key, message: `must be one of [${field.enum.join(', ')}]`, received: maskIfSensitive(key, raw) } };
  }
  if (field.minLength !== undefined && raw.length < field.minLength) {
    return { error: { key, message: `must be at least ${field.minLength} characters (got ${raw.length})`, received: maskIfSensitive(key, raw) } };
  }
  if (field.maxLength !== undefined && raw.length > field.maxLength) {
    return { error: { key, message: `must be at most ${field.maxLength} characters (got ${raw.length})`, received: maskIfSensitive(key, raw) } };
  }
  if (field.pattern && !field.pattern.test(raw)) {
    return { error: { key, message: `must match pattern ${field.pattern}`, received: maskIfSensitive(key, raw) } };
  }
  return { value: raw };
}

function validateNumber(key, raw, field) {
  const n = coerceNumber(raw);
  if (n === null) {
    return { error: { key, message: `must be a valid number`, received: raw } };
  }
  if (field.min !== undefined && n < field.min) {
    return { error: { key, message: `must be >= ${field.min}`, received: raw } };
  }
  if (field.max !== undefined && n > field.max) {
    return { error: { key, message: `must be <= ${field.max}`, received: raw } };
  }
  return { value: n };
}

function validateBoolean(key, raw) {
  const result = coerceBoolean(raw);
  if (result === null) {
    return { error: { key, message: `must be a boolean (true/false/1/0/yes/no/on/off)`, received: raw } };
  }
  return result;
}

function validateUrl(key, raw, field) {
  const protocols = field.protocols || ['http:', 'https:'];
  if (!isValidUrl(raw, protocols)) {
    return { error: { key, message: `must be a valid URL with protocol in [${protocols.join(', ')}]`, received: raw } };
  }
  return { value: raw };
}

function validateEmail(key, raw) {
  if (!isValidEmail(raw)) {
    return { error: { key, message: `must be a valid email address`, received: raw } };
  }
  return { value: raw };
}

function validatePort(key, raw, field) {
  const n = coerceNumber(raw);
  if (n === null || !Number.isInteger(n)) {
    return { error: { key, message: `must be an integer port number`, received: raw } };
  }
  const min = field.min !== undefined ? field.min : 1;
  const max = field.max !== undefined ? field.max : 65535;
  if (n < min || n > max) {
    return { error: { key, message: `must be between ${min} and ${max}`, received: raw } };
  }
  return { value: n };
}

function validateJson(key, raw) {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: { key, message: `must be valid JSON`, received: raw } };
  }
}

// ─── Custom validator runner ──────────────────────────────────────────────────

function runCustomValidator(key, value, customFn) {
  let result;
  try {
    result = customFn(value);
  } catch (err) {
    return { error: { key, message: `custom validator threw: ${err.message}` } };
  }
  if (result === true || result === undefined || result === null) return null;
  if (result === false) return { error: { key, message: `failed custom validation` } };
  if (typeof result === 'string') return { error: { key, message: result } };
  return null;
}

// ─── Main field validator ─────────────────────────────────────────────────────

/**
 * Validate a single env field synchronously.
 * @param {string} key
 * @param {string|undefined} rawValue
 * @param {object} field
 * @returns {{ value?: any, error?: object }}
 */
function validateField(key, rawValue, field) {
  const isRequired = field.required !== false;
  const hasDefault = field.default !== undefined;

  if (rawValue === undefined || rawValue === '') {
    if (hasDefault) return { value: field.default };
    if (!isRequired) return { value: undefined };
    return { error: { key, message: `is required but was not provided` } };
  }

  const raw = rawValue.trim();

  let typeResult;
  switch (field.type) {
    case 'string':  typeResult = validateString(key, raw, field); break;
    case 'number':  typeResult = validateNumber(key, raw, field); break;
    case 'boolean': typeResult = validateBoolean(key, raw);       break;
    case 'url':     typeResult = validateUrl(key, raw, field);    break;
    case 'email':   typeResult = validateEmail(key, raw);         break;
    case 'port':    typeResult = validatePort(key, raw, field);   break;
    case 'json':    typeResult = validateJson(key, raw);          break;
    default:        typeResult = { value: raw };
  }

  if (typeResult.error) return typeResult;

  if (typeof field.custom === 'function') {
    const customError = runCustomValidator(key, typeResult.value, field.custom);
    if (customError) return customError;
  }

  return typeResult;
}

/**
 * Async version of validateField — same logic but awaits custom() if it returns a Promise.
 * @param {string} key
 * @param {string|undefined} rawValue
 * @param {object} field
 * @returns {Promise<{ value?: any, error?: object }>}
 */
async function validateFieldAsync(key, rawValue, field) {
  const syncResult = validateField(key, rawValue, { ...field, custom: undefined });
  if (syncResult.error) return syncResult;

  if (typeof field.custom === 'function') {
    let result;
    try {
      result = await field.custom(syncResult.value);
    } catch (err) {
      return { error: { key, message: `custom validator threw: ${err.message}` } };
    }
    if (result === true || result === undefined || result === null) return syncResult;
    if (result === false) return { error: { key, message: `failed custom validation` } };
    if (typeof result === 'string') return { error: { key, message: result } };
  }

  return syncResult;
}

module.exports = { validateField, validateFieldAsync, maskIfSensitive };