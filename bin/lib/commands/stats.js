'use strict';

const { handler } = require('../action-runner');

function formatStats(stats) {
  const lines = [];
  lines.push(`Total prompts: ${stats.totalCount}`);
  lines.push('');
  lines.push('By category:');
  for (const category of stats.categoryStats) {
    lines.push(`  ${category.name}: ${category.count}`);
  }
  if (stats.popularTags.length > 0) {
    lines.push('');
    lines.push('Popular tags:');
    for (const tag of stats.popularTags) {
      lines.push(`  ${tag.name}: ${tag.count}`);
    }
  }
  return lines.join('\n');
}

function register(program) {
  program
    .command('stats')
    .description('Show prompt/category statistics')
    .action(
      handler(() => ({
        action: 'stats.get',
        humanFormatter: formatStats,
      }))
    );
}

module.exports = { register };
