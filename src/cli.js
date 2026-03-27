#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { generateEnvExample } = require('./parser');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

const args       = process.argv.slice(2);
const schemaArg  = args.find(a => !a.startsWith('--'));
const outputArg  = (args.find(a => a.startsWith('--output=')) || '').split('=')[1];
const outputPath = outputArg || '.env.example';

if (!schemaArg) {
  console.error(`
  ${BOLD}env-guard${RESET} – Generate .env.example from a schema file

  ${BOLD}Usage:${RESET}
    env-guard <schema-file> [--output=<path>]

  ${BOLD}Examples:${RESET}
    env-guard env.schema.js
    env-guard env.schema.js --output=.env.example.ci

  ${DIM}The schema file must export a plain object as module.exports.${RESET}
`);
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), schemaArg);

if (!fs.existsSync(schemaPath)) {
  console.error(`\n  ${RED}✖${RESET}  Schema file not found: ${schemaPath}\n`);
  process.exit(1);
}

try {
  const schema = require(schemaPath);

  if (typeof schema !== 'object' || Array.isArray(schema)) {
    console.error(`\n  ${RED}✖${RESET}  Schema must export a plain object\n`);
    process.exit(1);
  }

  generateEnvExample(schema, outputPath);
  console.log(`\n  ${GREEN}✔${RESET}  Generated ${BOLD}${outputPath}${RESET}\n`);
} catch (err) {
  console.error(`\n  ${RED}✖${RESET}  Failed to load schema: ${err.message}\n`);
  process.exit(1);
}