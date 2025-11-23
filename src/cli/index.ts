#!/usr/bin/env node
/**
 * CLI Entry Point
 * Main command-line interface for the Agentic Mobile App Builder
 */

import { Command } from 'commander';
import chalk from 'chalk';

// Import commands
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { listCommand } from './commands/list.js';
import { cancelCommand } from './commands/cancel.js';
import { resumeCommand } from './commands/resume.js';
import { logsCommand } from './commands/logs.js';
import { usageCommand } from './commands/usage.js';

const program = new Command();

program
  .name('agentic-builder')
  .description('Multi-agent orchestration framework for mobile app development')
  .version('1.0.0');

// Run command - Start a workflow
program
  .command('run <workflow>')
  .description('Start a workflow execution')
  .option('-p, --project <name>', 'Project name')
  .option('-d, --description <desc>', 'Project description')
  .option('--max-tier <tier>', 'Maximum model tier (haiku, sonnet, opus)', 'opus')
  .option('--no-branch', 'Skip git branch creation')
  .option('--no-pr', 'Skip PR creation')
  .option('--dry-run', 'Show what would be executed without running')
  .action(runCommand);

// Status command - Show run details
program
  .command('status <id>')
  .description('Show details of a workflow run or session')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output as JSON')
  .action(statusCommand);

// List command - List sessions
program
  .command('list')
  .description('List workflow sessions')
  .option('-a, --all', 'Show all sessions')
  .option('-z, --zombies', 'Show only zombie sessions')
  .option('-s, --status <status>', 'Filter by status')
  .option('-w, --workflow <id>', 'Filter by workflow')
  .option('-n, --limit <n>', 'Limit results', '20')
  .action(listCommand);

// Cancel command - Cancel a workflow
program
  .command('cancel <id>')
  .description('Cancel a running workflow')
  .option('-f, --force', 'Force cancel without confirmation')
  .option('--cleanup', 'Clean up associated resources (branches, etc.)')
  .action(cancelCommand);

// Resume command - Resume from checkpoint
program
  .command('resume <id>')
  .description('Resume a failed or paused workflow from last checkpoint')
  .option('--from-stage <n>', 'Resume from specific stage')
  .action(resumeCommand);

// Logs command - View execution logs
program
  .command('logs <id>')
  .description('View execution logs for a session')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .option('--level <level>', 'Filter by log level')
  .action(logsCommand);

// Usage command - Token usage stats
program
  .command('usage')
  .description('Show token usage statistics')
  .option('-s, --session <id>', 'Show usage for specific session')
  .option('--since <date>', 'Show usage since date')
  .option('--breakdown', 'Show breakdown by agent')
  .action(usageCommand);

// Workflows command - List available workflows
program
  .command('workflows')
  .description('List available workflow templates')
  .action(async () => {
    const { PREDEFINED_WORKFLOWS } = await import('../../orchestration/predefined-workflows.js');

    console.log(chalk.bold('\nAvailable Workflows:\n'));

    for (const [id, workflow] of Object.entries(PREDEFINED_WORKFLOWS)) {
      console.log(chalk.cyan(`  ${id}`));
      console.log(chalk.gray(`    ${workflow.description}`));
      console.log(chalk.gray(`    Stages: ${workflow.stages.length}`));
      console.log();
    }
  });

// Agents command - List available agents
program
  .command('agents')
  .description('List available agent types')
  .action(async () => {
    const { AGENT_CONFIGS } = await import('../../orchestration/agent-configs.js');
    const { ModelTier } = await import('../../orchestration/types.js');

    console.log(chalk.bold('\nAvailable Agents:\n'));

    for (const [type, config] of Object.entries(AGENT_CONFIGS)) {
      const tierColor = config.defaultModel === ModelTier.OPUS ? chalk.magenta :
                        config.defaultModel === ModelTier.SONNET ? chalk.blue :
                        chalk.green;

      console.log(chalk.cyan(`  ${type}`));
      console.log(chalk.white(`    ${config.name}`));
      console.log(chalk.gray(`    ${config.description}`));
      console.log(tierColor(`    Model: ${config.defaultModel}`));
      if (config.dependencies.length > 0) {
        console.log(chalk.gray(`    Depends on: ${config.dependencies.join(', ')}`));
      }
      console.log();
    }
  });

// Clean command - Clean up old sessions
program
  .command('clean')
  .description('Clean up old sessions and tasks')
  .option('--days <n>', 'Remove sessions older than N days', '30')
  .option('--dry-run', 'Show what would be removed')
  .action(async (options) => {
    const { getSessionManager } = await import('../../orchestration/session-manager.js');
    const { getTaskManager } = await import('../../pms/task-manager.js');

    const sessionManager = getSessionManager();
    const taskManager = getTaskManager();
    const days = parseInt(options.days);

    if (options.dryRun) {
      console.log(chalk.yellow(`Would clean up sessions older than ${days} days`));
      return;
    }

    const deletedSessions = sessionManager.cleanup(days);
    const deletedTasks = taskManager.cleanup(days);

    console.log(chalk.green(`Cleaned up ${deletedSessions} sessions and ${deletedTasks} tasks`));
  });

// Parse and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
