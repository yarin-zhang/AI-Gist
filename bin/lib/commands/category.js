'use strict';

const chalk = require('chalk');
const { handler } = require('../action-runner');
const { formatTable } = require('../output');

function formatCategoryList(categories) {
  if (!categories || categories.length === 0) return 'No categories found.';
  return formatTable(categories, [
    { label: 'ID', value: c => c.id },
    { label: 'NAME', value: c => c.name },
    { label: 'PROMPTS', value: c => (c.prompts ? c.prompts.length : 0) },
    { label: 'PARENT', value: c => c.parentId ?? '' },
  ]);
}

function formatCategoryDetail(category) {
  return `${chalk.bold(category.name)}  ${chalk.dim(`(id: ${category.id}, uuid: ${category.uuid})`)}`;
}

function register(program) {
  const categoryCmd = program.command('category').description('Manage prompt categories');

  categoryCmd
    .command('list')
    .description('List all categories')
    .action(
      handler(() => ({
        action: 'category.list',
        humanFormatter: formatCategoryList,
      }))
    );

  categoryCmd
    .command('create')
    .description('Create a new category')
    .requiredOption('--name <name>', 'Category name')
    .option('--description <text>', 'Description')
    .option('--color <color>', 'Color (any CSS color value)')
    .option('--icon <icon>', 'Icon identifier')
    .option('--parent <ref>', 'Parent category name, numeric id, or UUID')
    .action(
      handler(options => ({
        action: 'category.create',
        params: {
          name: options.name,
          description: options.description,
          color: options.color,
          icon: options.icon,
          parentRef: options.parent,
        },
        humanFormatter: formatCategoryDetail,
      }))
    );

  categoryCmd
    .command('update <ref>')
    .description('Update a category by name, numeric id, or UUID')
    .option('--name <name>', 'New name')
    .option('--description <text>', 'New description')
    .option('--color <color>', 'New color')
    .option('--icon <icon>', 'New icon identifier')
    .action(
      handler((ref, options) => ({
        action: 'category.update',
        params: {
          ref,
          name: options.name,
          description: options.description,
          color: options.color,
          icon: options.icon,
        },
        humanFormatter: formatCategoryDetail,
      }))
    );

  categoryCmd
    .command('delete <ref>')
    .description('Delete a category by name, numeric id, or UUID')
    .action(
      handler(ref => ({
        action: 'category.delete',
        params: { ref },
        humanFormatter: () => chalk.green(`Deleted category ${ref}`),
      }))
    );
}

module.exports = { register };
