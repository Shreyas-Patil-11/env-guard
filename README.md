# env-guard 🛡️

**Runtime `.env` validation for Node.js. Zero dependencies.**

```
"name": "@shreyas-patil/env-guard",
```

Stop your app from starting with bad config — get a clear, actionable error instead of a cryptic crash.

```
  env-guard: 2 environment variable errors found

  ✖  DATABASE_URL
     → is required but was not provided

  ✖  JWT_SECRET
     → must be at least 32 characters (got 9)
     received: toosho****
 
  Check your .env file and fix the above issues.
```

---

## Why env-guard?

| Feature | dotenv | zod | envalid | **env-guard** |
|---|---|---|---|---|
| Loads `.env` | ✅ | ❌ | ✅ | ✅ |
| Type coercion | ❌ | ✅ | ✅ | ✅ |
| Custom validators | ❌ | ✅ | ✅ | ✅ |
| Async validators | ❌ | ❌ | ❌ | ✅ |
| Secret masking | ❌ | ❌ | ❌ | ✅ |
| `.env.example` CLI | ❌ | ❌ | ❌ | ✅ |
| Pattern hints in example | ❌ | ❌ | ❌ | ✅ |
| Zero dependencies | ✅ | ❌ | ❌ | ✅ |
| Browser/Edge safe | ✅ | ✅ | ❌ | ✅ |

**env-guard = lightweight + zero deps + typed errors + secret masking + CLI**

---

## Quick start

```js
// src/env.js — import this everywhere instead of process.env
const { guard } = require('env-guard');

module.exports = guard({
  PORT:         { type: 'port',    default: 3000 },
  DATABASE_URL: { type: 'url',     description: 'PostgreSQL connection URL' },
  JWT_SECRET:   { type: 'string',  minLength: 32 },
  DEBUG:        { type: 'boolean', default: false },
  NODE_ENV: {
    type: 'string',
    enum: ['development', 'test', 'production'],
    default: 'development',
  },
}, { exitOnError: true });
```

```js
// app.js
const env = require('./src/env');
console.log(env.PORT);   // number  → 3000
console.log(env.DEBUG);  // boolean → false
```

---

## API

### `guard(schema, options)` — synchronous, throws on error

```js
const { guard } = require('env-guard');

const env = guard(schema, {
  envPath?: string | false,  // Path to .env. false = skip file loading. Default: ./.env
  failFast?: boolean,         // Stop after first error. Default: false
  exitOnError?: boolean,      // Print errors and process.exit(1). Default: false
  overrides?: object,         // Injected after process.env. Great for tests.
});
```

### `safeGuard(schema, options)` — no throw, returns result object

```js
const { safeGuard } = require('env-guard');

const result = safeGuard(schema);

if (!result.success) {
  console.error(result.errors); // [{ key, message, received? }]
} else {
  console.log(result.data.PORT);
}
```

### `guardAsync(schema, options)` — async custom validators

```js
const { guardAsync } = require('env-guard');

const env = await guardAsync({
  STRIPE_KEY: {
    type: 'string',
    custom: async (v) => {
      const ok = await verifyStripeKey(v);
      return ok || 'STRIPE_KEY is invalid or revoked';
    },
  },
});
```

### `generateExample(schema, outputPath)` — write `.env.example`

```js
const { generateExample } = require('env-guard');
const schema = require('./src/env.schema');

generateExample(schema, '.env.example');
```

---

## Schema reference

Every field requires `type`. Everything else is optional.

### Common properties

| Property | Type | Description |
|---|---|---|
| `type` | `string` | **Required.** See types below. |
| `description` | `string` | Written as a comment in `.env.example`. |
| `required` | `boolean` | Defaults to `true`. |
| `default` | `any` | Used when variable is missing. |
| `example` | `string` | Shown in generated `.env.example`. |
| `custom` | `function` | Custom validator (see below). |

### Types

```js
{ type: 'string',  minLength, maxLength, pattern, enum }
{ type: 'number',  min, max }
{ type: 'boolean' }  // accepts true/false/1/0/yes/no/on/off (case-insensitive)
{ type: 'url',     protocols: ['http:', 'https:'] }
{ type: 'email' }
{ type: 'port',    min, max }  // integer 1–65535
{ type: 'json' }               // parsed with JSON.parse
```

### Custom validators

Return `true` / `undefined` to pass. Return `false` or a string to fail:

```js
API_KEY: {
  type: 'string',
  custom: (v) => v.startsWith('sk_') || 'Must start with sk_',
},

// Async — verify against a live server
STRIPE_KEY: {
  type: 'string',
  custom: async (v) => {
    const valid = await verifyWithStripe(v);
    return valid || 'Key is invalid or revoked';
  },
},
```

The `custom` function always receives the **coerced** value — a `number` for `type: 'number'`, a `boolean` for `type: 'boolean'`, etc.

---

## Secret masking

Keys containing `secret`, `token`, `key`, `password`, `auth`, or `credential` automatically have their value masked in error output:

```
  ✖  JWT_SECRET
     → must be at least 32 characters (got 9)
     received: toosho****        ← never leaks the full secret
```

---

## Generating `.env.example`

### CLI

```bash
npx env-guard env.schema.js
npx env-guard env.schema.js --output=.env.example.ci
```

Schema file must export a plain object:

```js
// env.schema.js
module.exports = {
  PORT:         { type: 'port',   default: 3000 },
  DATABASE_URL: { type: 'url',    description: 'PostgreSQL URL' },
  JWT_SECRET:   { type: 'string', minLength: 32, pattern: /^[a-zA-Z0-9_-]{32,}$/ },
};
```

Generated output:

```env
# ─── Auto-generated by env-guard ─────────────────────────────────────────────
# Do not commit real secrets. Fill in values before running the application.

# HTTP server port
# Type: port | optional
# Default: 3000
PORT=3000

# PostgreSQL URL
# Type: url | required
DATABASE_URL=

# Type: string | required
# Pattern: /^[a-zA-Z0-9_-]{32,}$/     ← pattern hint auto-included
# Length: min 32 chars
JWT_SECRET=
```

### Programmatic

```js
const { generateExample } = require('env-guard');
generateExample(require('./env.schema'), '.env.example');
```

---

## Testing

Use `overrides` to inject env vars without touching `process.env`:

```js
const { safeGuard } = require('env-guard');
const schema = require('./src/env.schema');

test('valid config passes', () => {
  const result = safeGuard(schema, {
    envPath: false,
    overrides: {
      DATABASE_URL: 'postgres://localhost/test',
      JWT_SECRET:   'a-sufficiently-long-secret-for-testing',
    },
  });
  expect(result.success).toBe(true);
});

test('missing DATABASE_URL is caught', () => {
  const result = safeGuard(schema, { envPath: false });
  const keys = result.errors.map(e => e.key);
  expect(keys).toContain('DATABASE_URL');
});
```

---

## Browser / Edge runtime

`guard()` detects non-server environments (`typeof window !== 'undefined'`) and skips validation entirely, returning `process.env` as-is. This prevents crashes in Next.js Client Components or Edge functions where `fs` is unavailable.

---

## Publishing checklist

```bash
# 1. Set your name in package.json
# 2. Bump version: 1.0.0
npm login
npm publish --access public
```

---

## License

MIT#