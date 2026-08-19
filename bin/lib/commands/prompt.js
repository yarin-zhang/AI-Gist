'use strict';

const chalk = require('chalk');
const { handler } = require('../action-runner');
const { formatTable } = require('../output');
const { resolveContent, parseTags, parseOptions, collect, parseKeyValuePairs } = require('../params');

function parseIntOption(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a number, got "${value}"`);
  }
  return parsed;
}

function formatTagsField(tags) {
  return Array.isArray(tags) ? tags.join(',') : tags || '';
}

function formatPromptList(result) {
  const prompts = result.data || [];
  if (prompts.length === 0) return 'No prompts found.';

  const table = formatTable(prompts, [
    { label: 'ID', value: p => p.id },
    { label: 'TITLE', value: p => p.title },
    { label: 'CATEGORY', value: p => (p.category ? p.category.name : '-') },
    { label: 'TAGS', value: p => formatTagsField(p.tags) },
    { label: 'FAV', value: p => (p.isFavorite ? '*' : '') },
  ]);

  return `${table}\n\n${prompts.length} of ${result.total} prompt(s)`;
}

function formatPromptDetail(prompt) {
  const lines = [];
  lines.push(`${chalk.bold(prompt.title)}  ${chalk.dim(`(id: ${prompt.id}, uuid: ${prompt.uuid})`)}`);
  if (prompt.description) lines.push(prompt.description);
  lines.push(`Category: ${prompt.category ? prompt.category.name : '(none)'}`);
  lines.push(`Tags: ${formatTagsField(prompt.tags) || '(none)'}`);
  lines.push('');
  lines.push(chalk.dim('--- content ---'));
  lines.push(prompt.content);

  if (prompt.variables && prompt.variables.length > 0) {
    lines.push('');
    lines.push(chalk.dim('--- variables ---'));
    for (const variable of prompt.variables) {
      const parts = [`{{${variable.name}}}`, `type=${variable.type}`];
      if (variable.required) parts.push('required');
      if (variable.defaultValue !== undefined) parts.push(`default=${variable.defaultValue}`);
      lines.push(`  ${parts.join('  ')}`);
    }
  }

  return lines.join('\n');
}

function formatVariableList(variables) {
  if (!variables || variables.length === 0) {
    return 'No variables defined yet. Run "prompt variable sync" to auto-detect {{name}} placeholders from the content.';
  }
  return formatTable(variables, [
    { label: 'NAME', value: v => v.name },
    { label: 'TYPE', value: v => v.type },
    { label: 'REQUIRED', value: v => (v.required ? 'yes' : 'no') },
    { label: 'DEFAULT', value: v => v.defaultValue || '' },
  ]);
}

function formatSyncResult(result) {
  if (!result.created || result.created.length === 0) {
    return 'No new variables found (every {{name}} placeholder already has a definition).';
  }
  return `Created ${result.created.length} variable(s): ${result.created.map(v => v.name).join(', ')}`;
}

function register(program) {
  const promptCmd = program
    .command('prompt')
    .description('Create, read, update, delete prompts and manage their {{variable}} placeholders ("挖空")');

  promptCmd
    .command('list')
    .description('List prompts')
    .option('--category <ref>', 'Filter by category name, numeric id, or UUID')
    .option('--tag <tags>', 'Filter by tag(s), comma-separated')
    .option('--favorite', 'Only show favorited prompts')
    .option('--search <text>', 'Full-text search across title/content/description')
    .option('--sort <key>', 'timeDesc | timeAsc | useCount | favorite | title | createdAt | updatedAt')
    .option('--page <n>', 'Page number (1-based)', parseIntOption)
    .option('--limit <n>', 'Page size', parseIntOption)
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ ai-gist prompt list\n' +
        '  $ ai-gist prompt list --category Writing --favorite\n' +
        '  $ ai-gist prompt list --search "release notes" --json\n'
    )
    .action(
      handler(options => ({
        action: 'prompt.list',
        params: {
          categoryRef: options.category,
          tags: options.tag,
          isFavorite: options.favorite ? true : undefined,
          search: options.search,
          sortBy: options.sort,
          page: options.page,
          limit: options.limit,
        },
        humanFormatter: formatPromptList,
      }))
    );

  promptCmd
    .command('get <ref>')
    .description('Show a single prompt by numeric id or UUID')
    .action(
      handler(ref => ({
        action: 'prompt.get',
        params: { ref },
        humanFormatter: formatPromptDetail,
      }))
    );

  promptCmd
    .command('create')
    .description('Create a new prompt. Mark fill-in-the-blank spots with {{variable_name}} in the content ("挖空"), then define them with "prompt variable add/sync".')
    .requiredOption('--title <title>', 'Prompt title')
    .option('--content <text>', 'Prompt content. Use {{name}} for variable placeholders. Pass "-" to read from stdin.')
    .option('--content-file <path>', 'Read the prompt content from a file instead of --content')
    .option('--description <text>', 'Short description')
    .option('--category <ref>', 'Category name, numeric id, or UUID')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--favorite', 'Mark as favorite')
    .option('--jinja', 'Treat the content as a Jinja template')
    .addHelpText(
      'after',
      '\nExample ("挖空" workflow — mark a placeholder, then define it):\n' +
        '  $ ai-gist prompt create --title "Release notes" \\\n' +
        '      --content "Summarize the changes for {{product}} version {{version}}." \\\n' +
        '      --category Writing --tags "release,writing"\n' +
        '  $ ai-gist prompt variable sync <id-from-above>\n' +
        '  $ ai-gist prompt fill <id-from-above> --var product="AI Gist" --var version=2.1.0\n'
    )
    .action(
      handler(async options => {
        if (!options.content && !options.contentFile) {
          throw new Error('Provide --content or --content-file');
        }
        const content = await resolveContent(options.content, options.contentFile);
        return {
          action: 'prompt.create',
          params: {
            title: options.title,
            content,
            description: options.description,
            categoryRef: options.category,
            tags: parseTags(options.tags),
            isFavorite: options.favorite || undefined,
            isJinjaTemplate: options.jinja || undefined,
          },
          humanFormatter: formatPromptDetail,
        };
      })
    );

  promptCmd
    .command('update <ref>')
    .description('Update an existing prompt (only the provided fields are changed)')
    .option('--title <title>', 'New title')
    .option('--content <text>', 'New content. Pass "-" to read from stdin.')
    .option('--content-file <path>', 'Read the new content from a file instead of --content')
    .option('--description <text>', 'New description')
    .option('--category <ref>', 'Category name, numeric id, or UUID (pass an empty string to uncategorize)')
    .option('--tags <tags>', 'Comma-separated tags (replaces the existing tags)')
    .option('--favorite <value>', 'true or false')
    .action(
      handler(async (ref, options) => {
        const content = options.content || options.contentFile
          ? await resolveContent(options.content, options.contentFile)
          : undefined;
        return {
          action: 'prompt.update',
          params: {
            ref,
            title: options.title,
            content,
            description: options.description,
            categoryRef: options.category === '' ? null : options.category,
            tags: parseTags(options.tags),
            isFavorite: options.favorite === undefined ? undefined : options.favorite === 'true',
          },
          humanFormatter: formatPromptDetail,
        };
      })
    );

  promptCmd
    .command('delete <ref>')
    .description('Delete a prompt (and its variables/history) by id or UUID')
    .action(
      handler(ref => ({
        action: 'prompt.delete',
        params: { ref },
        humanFormatter: () => chalk.green(`Deleted prompt ${ref}`),
      }))
    );

  promptCmd
    .command('fill <ref>')
    .description('Render a prompt by substituting its {{variable}} placeholders with real values')
    .option('--var <name=value>', 'A variable assignment, repeatable', collect, [])
    .addHelpText('after', '\nExample:\n  $ ai-gist prompt fill 12 --var topic="Q3 roadmap" --var tone=formal\n')
    .action(
      handler((ref, options) => ({
        action: 'prompt.fill',
        params: { ref, variables: parseKeyValuePairs(options.var, '--var') },
        humanFormatter: result => result.filledContent,
      }))
    );

  const variableCmd = promptCmd.command('variable').description('Manage a prompt\'s {{variable}} placeholders ("挖空")');

  variableCmd
    .command('list <ref>')
    .description('List the variables defined for a prompt')
    .action(
      handler(ref => ({
        action: 'prompt.variable.list',
        params: { ref },
        humanFormatter: formatVariableList,
      }))
    );

  variableCmd
    .command('add <ref>')
    .description('Define a variable for a {{name}} placeholder already present in the prompt content')
    .requiredOption('--name <name>', 'Variable name, must match a {{name}} placeholder in the content')
    .option('--type <type>', 'text | textarea | select | number | boolean (default: text)')
    .option('--description <text>', 'Shown as help text when filling the variable')
    .option('--default <value>', 'Default value')
    .option('--options <values>', 'Comma-separated choices, used when --type select')
    .option('--required', 'Mark as required')
    .option('--placeholder <text>', 'Placeholder text for the input')
    .action(
      handler((ref, options) => ({
        action: 'prompt.variable.add',
        params: {
          ref,
          name: options.name,
          type: options.type,
          description: options.description,
          defaultValue: options.default,
          options: parseOptions(options.options),
          required: options.required || undefined,
          placeholder: options.placeholder,
        },
        humanFormatter: variable => chalk.green(`Added variable "${variable.name}" (type: ${variable.type})`),
      }))
    );

  variableCmd
    .command('remove <ref> <name>')
    .description('Remove a variable definition')
    .action(
      handler((ref, name) => ({
        action: 'prompt.variable.remove',
        params: { ref, name },
        humanFormatter: () => chalk.green(`Removed variable "${name}"`),
      }))
    );

  variableCmd
    .command('sync <ref>')
    .description('"挖空": scan the content for {{name}} placeholders and auto-create a default text variable for each one that is not defined yet')
    .action(
      handler(ref => ({
        action: 'prompt.variable.sync',
        params: { ref },
        humanFormatter: formatSyncResult,
      }))
    );
}

module.exports = { register };
