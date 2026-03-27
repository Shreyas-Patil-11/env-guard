'use strict';

const { guard, safeGuard, guardAsync, safeGuardAsync, EnvValidationError } = require('../src/index');
const { parseEnvFile } = require('../src/parser');
const { maskIfSensitive } = require('../src/validator');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── Helper ───────────────────────────────────────────────────────────────────

function run(schema, overrides = {}, opts = {}) {
  return safeGuard(schema, { envPath: false, overrides, ...opts });
}

// ─── string ──────────────────────────────────────────────────────────────────

describe('string validation', () => {
  const schema = { NAME: { type: 'string' } };

  it('passes a valid string', () => {
    const r = run(schema, { NAME: 'Alice' });
    expect(r.success).toBe(true);
    expect(r.data.NAME).toBe('Alice');
  });

  it('fails when required and missing', () => {
    const r = run(schema, {});
    expect(r.success).toBe(false);
    expect(r.errors[0].key).toBe('NAME');
  });

  it('uses default when not provided', () => {
    const r = run({ NAME: { type: 'string', default: 'World' } }, {});
    expect(r.success).toBe(true);
    expect(r.data.NAME).toBe('World');
  });

  it('validates enum', () => {
    const s = { MODE: { type: 'string', enum: ['dev', 'prod'] } };
    expect(run(s, { MODE: 'dev' }).success).toBe(true);
    expect(run(s, { MODE: 'staging' }).success).toBe(false);
  });

  it('validates minLength', () => {
    const s = { TOKEN: { type: 'string', minLength: 8 } };
    expect(run(s, { TOKEN: 'short' }).success).toBe(false);
    expect(run(s, { TOKEN: 'longenough' }).success).toBe(true);
  });

  it('validates maxLength', () => {
    const s = { TOKEN: { type: 'string', maxLength: 5 } };
    expect(run(s, { TOKEN: 'toolong' }).success).toBe(false);
    expect(run(s, { TOKEN: 'ok' }).success).toBe(true);
  });

  it('includes char count in minLength error', () => {
    const s = { TOKEN: { type: 'string', minLength: 10 } };
    const r = run(s, { TOKEN: 'abc' });
    expect(r.errors[0].message).toMatch(/got 3/);
  });

  it('validates pattern', () => {
    const s = { KEY: { type: 'string', pattern: /^[A-Z]+$/ } };
    expect(run(s, { KEY: 'HELLO' }).success).toBe(true);
    expect(run(s, { KEY: 'hello123' }).success).toBe(false);
  });
});

// ─── number ──────────────────────────────────────────────────────────────────

describe('number validation', () => {
  const schema = { WORKERS: { type: 'number' } };

  it('coerces string to number', () => {
    const r = run(schema, { WORKERS: '4' });
    expect(r.success).toBe(true);
    expect(r.data.WORKERS).toBe(4);
  });

  it('fails on non-numeric string', () => {
    expect(run(schema, { WORKERS: 'four' }).success).toBe(false);
  });

  it('validates min', () => {
    const s = { N: { type: 'number', min: 1 } };
    expect(run(s, { N: '0' }).success).toBe(false);
    expect(run(s, { N: '1' }).success).toBe(true);
  });

  it('validates max', () => {
    const s = { N: { type: 'number', max: 10 } };
    expect(run(s, { N: '11' }).success).toBe(false);
    expect(run(s, { N: '10' }).success).toBe(true);
  });
});

// ─── boolean ─────────────────────────────────────────────────────────────────

describe('boolean validation', () => {
  const schema = { DEBUG: { type: 'boolean' } };

  test.each([
    ['true', true], ['1', true], ['yes', true], ['on', true], ['TRUE', true],
  ])('coerces "%s" → true', (raw, expected) => {
    const r = run(schema, { DEBUG: raw });
    expect(r.success).toBe(true);
    expect(r.data.DEBUG).toBe(expected);
  });

  test.each([
    ['false', false], ['0', false], ['no', false], ['off', false], ['FALSE', false],
  ])('coerces "%s" → false', (raw, expected) => {
    const r = run(schema, { DEBUG: raw });
    expect(r.success).toBe(true);
    expect(r.data.DEBUG).toBe(expected);
  });

  it('fails on invalid boolean string', () => {
    expect(run(schema, { DEBUG: 'maybe' }).success).toBe(false);
  });

  it('uses default value', () => {
    const r = run({ DEBUG: { type: 'boolean', default: false } }, {});
    expect(r.success).toBe(true);
    expect(r.data.DEBUG).toBe(false);
  });
});

// ─── url ─────────────────────────────────────────────────────────────────────

describe('url validation', () => {
  const schema = { API_URL: { type: 'url' } };

  it('passes a valid https URL', () => {
    expect(run(schema, { API_URL: 'https://api.example.com' }).success).toBe(true);
  });

  it('passes a valid http URL', () => {
    expect(run(schema, { API_URL: 'http://localhost:3000' }).success).toBe(true);
  });

  it('fails on a plain string', () => {
    expect(run(schema, { API_URL: 'not-a-url' }).success).toBe(false);
  });

  it('respects custom protocols', () => {
    const s = { DB: { type: 'url', protocols: ['postgres:'] } };
    expect(run(s, { DB: 'postgres://localhost/mydb' }).success).toBe(true);
    expect(run(s, { DB: 'https://localhost/mydb' }).success).toBe(false);
  });
});

// ─── email ───────────────────────────────────────────────────────────────────

describe('email validation', () => {
  const schema = { EMAIL: { type: 'email' } };
  it('passes a valid email', () => expect(run(schema, { EMAIL: 'user@example.com' }).success).toBe(true));
  it('fails an invalid email', () => expect(run(schema, { EMAIL: 'not-an-email' }).success).toBe(false));
  it('fails email without domain', () => expect(run(schema, { EMAIL: 'user@' }).success).toBe(false));
});

// ─── port ────────────────────────────────────────────────────────────────────

describe('port validation', () => {
  const schema = { PORT: { type: 'port' } };

  it('coerces a valid port string', () => {
    const r = run(schema, { PORT: '3000' });
    expect(r.success).toBe(true);
    expect(r.data.PORT).toBe(3000);
  });

  it('fails on out-of-range port (99999)', () => expect(run(schema, { PORT: '99999' }).success).toBe(false));
  it('fails on port 0',                    () => expect(run(schema, { PORT: '0' }).success).toBe(false));
  it('fails on float',                     () => expect(run(schema, { PORT: '3.14' }).success).toBe(false));
  it('fails on non-numeric',               () => expect(run(schema, { PORT: 'http' }).success).toBe(false));
});

// ─── json ────────────────────────────────────────────────────────────────────

describe('json validation', () => {
  const schema = { CONFIG: { type: 'json' } };

  it('parses a valid JSON object', () => {
    const r = run(schema, { CONFIG: '{"key":"value"}' });
    expect(r.success).toBe(true);
    expect(r.data.CONFIG.key).toBe('value');
  });

  it('parses a JSON array', () => {
    const r = run(schema, { CONFIG: '[1,2,3]' });
    expect(r.success).toBe(true);
    expect(r.data.CONFIG).toEqual([1, 2, 3]);
  });

  it('parses a JSON boolean', () => {
    const r = run(schema, { CONFIG: 'true' });
    expect(r.success).toBe(true);
    expect(r.data.CONFIG).toBe(true);
  });

  it('fails on invalid JSON', () => {
    expect(run(schema, { CONFIG: '{invalid}' }).success).toBe(false);
  });
});

// ─── secret masking ──────────────────────────────────────────────────────────

describe('secret masking', () => {
  it('masks SECRET keys in error received value', () => {
    const r = run({ JWT_SECRET: { type: 'string', minLength: 32 } }, { JWT_SECRET: 'tooshort' });
    expect(r.success).toBe(false);
    expect(r.errors[0].received).not.toBe('tooshort');
    expect(r.errors[0].received).toMatch(/\*/);
  });

  it('masks TOKEN keys', () => {
    expect(maskIfSensitive('API_TOKEN', 'abc123xyz')).toMatch(/\*/);
  });

  it('masks PASSWORD keys', () => {
    expect(maskIfSensitive('DB_PASSWORD', 'mypassword')).toMatch(/\*/);
  });

  it('does NOT mask normal keys', () => {
    expect(maskIfSensitive('NODE_ENV', 'production')).toBe('production');
    expect(maskIfSensitive('PORT', '3000')).toBe('3000');
  });

  it('masks very short secrets entirely', () => {
    expect(maskIfSensitive('API_KEY', 'abc')).toBe('****');
  });
});

// ─── custom validator ─────────────────────────────────────────────────────────

describe('custom validator', () => {
  it('passes when custom() returns true', () => {
    const s = { KEY: { type: 'string', custom: () => true } };
    expect(run(s, { KEY: 'anything' }).success).toBe(true);
  });

  it('passes when custom() returns undefined', () => {
    const s = { KEY: { type: 'string', custom: () => undefined } };
    expect(run(s, { KEY: 'anything' }).success).toBe(true);
  });

  it('fails when custom() returns false', () => {
    const s = { KEY: { type: 'string', custom: () => false } };
    const r = run(s, { KEY: 'anything' });
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toMatch(/custom validation/);
  });

  it('uses the error message when custom() returns a string', () => {
    const s = {
      API_KEY: {
        type: 'string',
        custom: (v) => v.startsWith('sk_') || 'Must start with sk_',
      }
    };
    expect(run(s, { API_KEY: 'sk_live_abc' }).success).toBe(true);
    const r = run(s, { API_KEY: 'not_valid' });
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toBe('Must start with sk_');
  });

  it('catches exceptions thrown by custom()', () => {
    const s = { KEY: { type: 'string', custom: () => { throw new Error('boom'); } } };
    const r = run(s, { KEY: 'value' });
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toMatch(/boom/);
  });

  it('receives coerced value (not raw string) for number fields', () => {
    let received;
    const s = { N: { type: 'number', custom: (v) => { received = v; return true; } } };
    run(s, { N: '42' });
    expect(received).toBe(42); // number, not '42'
  });
});

// ─── async custom validator ───────────────────────────────────────────────────

describe('guardAsync / safeGuardAsync', () => {
  it('passes with async custom() that resolves true', async () => {
    const s = {
      API_KEY: {
        type: 'string',
        custom: async (v) => v.startsWith('sk_') || 'Must start with sk_',
      }
    };
    const r = await safeGuardAsync(s, { envPath: false, overrides: { API_KEY: 'sk_live_abc' } });
    expect(r.success).toBe(true);
  });

  it('fails with async custom() that resolves an error message', async () => {
    const s = {
      API_KEY: {
        type: 'string',
        custom: async (v) => v.startsWith('sk_') || 'Must start with sk_',
      }
    };
    const r = await safeGuardAsync(s, { envPath: false, overrides: { API_KEY: 'bad_key' } });
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toBe('Must start with sk_');
  });

  it('handles async custom() that rejects', async () => {
    const s = {
      KEY: {
        type: 'string',
        custom: async () => { throw new Error('network error'); },
      }
    };
    const r = await safeGuardAsync(s, { envPath: false, overrides: { KEY: 'value' } });
    expect(r.success).toBe(false);
    expect(r.errors[0].message).toMatch(/network error/);
  });

  it('runs sync fields fine through guardAsync', async () => {
    const r = await safeGuardAsync(
      { PORT: { type: 'port', default: 3000 } },
      { envPath: false }
    );
    expect(r.success).toBe(true);
    expect(r.data.PORT).toBe(3000);
  });
});

// ─── guard() throwing behaviour ──────────────────────────────────────────────

describe('guard() throwing behaviour', () => {
  it('throws EnvValidationError on failure', () => {
    expect(() =>
      guard({ SECRET: { type: 'string' } }, { envPath: false })
    ).toThrow(EnvValidationError);
  });

  it('collects all errors by default (failFast: false)', () => {
    try {
      guard({ A: { type: 'string' }, B: { type: 'number' } }, { envPath: false });
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect(err.errors).toHaveLength(2);
    }
  });

  it('stops after first error when failFast: true', () => {
    try {
      guard(
        { A: { type: 'string' }, B: { type: 'number' } },
        { envPath: false, failFast: true }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect(err.errors).toHaveLength(1);
    }
  });

  it('error message includes the field name', () => {
    try {
      guard({ MY_KEY: { type: 'string' } }, { envPath: false });
    } catch (err) {
      expect(err.message).toContain('MY_KEY');
    }
  });
});

// ─── safeGuard() ─────────────────────────────────────────────────────────────

describe('safeGuard()', () => {
  it('returns success: true on valid input', () => {
    const r = safeGuard(
      { PORT: { type: 'port' } },
      { envPath: false, overrides: { PORT: '8080' } }
    );
    expect(r.success).toBe(true);
    expect(r.data.PORT).toBe(8080);
  });

  it('returns success: false with errors on invalid input', () => {
    const r = safeGuard({ PORT: { type: 'port' } }, { envPath: false });
    expect(r.success).toBe(false);
    expect(Array.isArray(r.errors)).toBe(true);
  });
});

// ─── optional fields ─────────────────────────────────────────────────────────

describe('optional fields', () => {
  it('skips optional field with no value', () => {
    const r = run({ FLAG: { type: 'boolean', required: false } }, {});
    expect(r.success).toBe(true);
    expect(r.data.FLAG).toBeUndefined();
  });

  it('uses default for optional field', () => {
    const r = run({ FLAG: { type: 'boolean', required: false, default: true } }, {});
    expect(r.success).toBe(true);
    expect(r.data.FLAG).toBe(true);
  });

  it('field with required:true but a default is satisfied without env var', () => {
    const r = run({ PORT: { type: 'port', required: true, default: 3000 } }, {});
    expect(r.success).toBe(true);
    expect(r.data.PORT).toBe(3000);
  });
});

// ─── overrides ───────────────────────────────────────────────────────────────

describe('overrides option', () => {
  it('overrides take precedence over process.env', () => {
    process.env._TEST_EG_PORT = '9999';
    const r = safeGuard(
      { _TEST_EG_PORT: { type: 'port' } },
      { envPath: false, overrides: { _TEST_EG_PORT: '1234' } }
    );
    delete process.env._TEST_EG_PORT;
    expect(r.success).toBe(true);
    expect(r.data._TEST_EG_PORT).toBe(1234);
  });
});

// ─── .env file parser ────────────────────────────────────────────────────────

describe('parseEnvFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-guard-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(content) {
    const f = path.join(tmpDir, '.env');
    fs.writeFileSync(f, content, 'utf-8');
    return f;
  }

  it('parses simple KEY=value', () => {
    const f = write('FOO=bar\nBAZ=qux\n');
    expect(parseEnvFile(f)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('parses double-quoted values', () => {
    const f = write('MSG="hello world"\n');
    expect(parseEnvFile(f).MSG).toBe('hello world');
  });

  it('handles escaped double-quotes inside double-quoted value', () => {
    const f = write('MSG="say \\"hi\\""\n');
    expect(parseEnvFile(f).MSG).toBe('say "hi"');
  });

  it('parses single-quoted values', () => {
    const f = write("MSG='hello world'\n");
    expect(parseEnvFile(f).MSG).toBe('hello world');
  });

  it('strips inline comments on unquoted values', () => {
    const f = write('PORT=3000 # http port\n');
    expect(parseEnvFile(f).PORT).toBe('3000');
  });

  it('handles export prefix', () => {
    const f = write('export FOO=bar\n');
    expect(parseEnvFile(f).FOO).toBe('bar');
  });

  it('skips blank lines and comment lines', () => {
    const f = write('# comment\n\nFOO=bar\n');
    expect(parseEnvFile(f)).toEqual({ FOO: 'bar' });
  });

  it('handles Windows CRLF line endings', () => {
    const f = write('FOO=bar\r\nBAZ=qux\r\n');
    expect(parseEnvFile(f)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('handles Windows CR-only line endings', () => {
    const f = write('FOO=bar\rBAZ=qux\r');
    expect(parseEnvFile(f)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('handles multiline double-quoted value', () => {
    const f = write('MSG="line one\nline two"\n');
    expect(parseEnvFile(f).MSG).toBe('line one\nline two');
  });

  it('handles \\n escape in double-quoted value', () => {
    const f = write('MSG="line one\\nline two"\n');
    expect(parseEnvFile(f).MSG).toBe('line one\nline two');
  });

  it('returns empty object for missing file', () => {
    expect(parseEnvFile('/nonexistent/.env')).toEqual({});
  });
});