#!/usr/bin/env node
'use strict';

const { Command } = require('commander');

const pkg = require('../package.json');
const statusCommand = require('./lib/commands/status');
const promptCommand = require('./lib/commands/prompt');
const categoryCommand = require('./lib/commands/category');
const statsCommand = require('./lib/commands/stats');

const program = new Command();

program
  .name('ai-gist')
  .description(
    'Local CLI for AI Gist — create, read, update, and "挖空" (fill-in-the-blank) prompts ' +
      'from the terminal, for use by coding agents (e.g. Claude Code) or shell scripts.\n\n' +
      'AI Gist stores data only inside its desktop app, so this CLI talks to a running copy ' +
      'of the app over a local, token-authenticated loopback connection. That connection is ' +
      'OFF by default — turn it on once in AI Gist under Settings → Local CLI → ' +
      '"Enable local CLI access", then run "ai-gist status" to verify.'
  )
  .version(pkg.version)
  .option('--json', 'Output machine-readable JSON instead of human-readable text');

program.addHelpText(
  'after',
  '\n' +
    'The "挖空" workflow (turning a plain prompt into a fill-in-the-blank template):\n' +
    '  1. Write {{name}} placeholders directly in the prompt content.\n' +
    '  2. Run "ai-gist prompt variable sync <id>" to auto-create a variable for each placeholder,\n' +
    '     or "ai-gist prompt variable add <id> --name <name> ..." to define one with a specific type.\n' +
    '  3. Run "ai-gist prompt fill <id> --var name=value" to render the final text.\n\n' +
    'Getting started:\n' +
    '  $ ai-gist status\n' +
    '  $ ai-gist prompt list\n' +
    '  $ ai-gist prompt create --title "Bug report" --content "Summarize: {{topic}}"\n' +
    '  $ ai-gist --help                 # this overview\n' +
    '  $ ai-gist prompt --help          # prompt subcommands\n' +
    '  $ ai-gist prompt create --help   # flags + examples for one subcommand\n'
);

statusCommand.register(program);
promptCommand.register(program);
categoryCommand.register(program);
statsCommand.register(program);

program.parseAsync(process.argv).catch(error => {
  process.stderr.write(`Unexpected error: ${error && error.message ? error.message : error}\n`);
  process.exitCode = 1;
});
