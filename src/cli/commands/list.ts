/**
 * List Command - List workflow sessions
 * Includes zombie detection
 */

import chalk from 'chalk';
import { getSessionManager } from '../../../orchestration/session-manager.js';
import { getWorkflowEngine } from '../../../orchestration/workflow-engine.js';
import { getWorkflow } from '../../../orchestration/predefined-workflows.js';

interface ListOptions {
  all?: boolean;
  zombies?: boolean;
  status?: string;
  workflow?: string;
  limit?: string;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const sessionManager = getSessionManager();
  const engine = getWorkflowEngine();

  // Build filters
  const filters: any = {};
  if (options.status) {
    filters.status = options.status;
  }
  if (options.workflow) {
    filters.workflowId = options.workflow;
  }

  // Get sessions
  let sessions = sessionManager.listSessions(filters);

  // Apply limit (unless showing all)
  const limit = options.all ? sessions.length : parseInt(options.limit || '20');
  sessions = sessions.slice(0, limit);

  // Filter for zombies if requested
  if (options.zombies) {
    sessions = sessions.filter(s => {
      return s.status === 'running' && !engine.hasActiveRun(s.id);
    });
  }

  // Output
  if (sessions.length === 0) {
    console.log(chalk.gray('\nNo sessions found.'));
    return;
  }

  console.log(chalk.bold(`\nWorkflow Sessions (${sessions.length}):\n`));

  // Table header
  console.log(
    chalk.gray(
      '  ' +
      'ID'.padEnd(38) +
      'STATUS'.padEnd(12) +
      'WORKFLOW'.padEnd(24) +
      'CREATED'
    )
  );
  console.log(chalk.gray('  ' + '-'.repeat(90)));

  for (const session of sessions) {
    const isZombie = session.status === 'running' && !engine.hasActiveRun(session.id);
    const workflow = getWorkflow(session.workflowId);

    // Status with color
    const statusColor = {
      running: chalk.blue,
      completed: chalk.green,
      failed: chalk.red,
      paused: chalk.yellow
    }[session.status] || chalk.gray;

    let statusText = session.status.padEnd(10);
    if (isZombie) {
      statusText = chalk.red('ZOMBIE').padEnd(10);
    }

    // Format date
    const created = new Date(session.createdAt);
    const dateStr = created.toLocaleDateString() + ' ' + created.toLocaleTimeString().slice(0, 5);

    // Print row
    console.log(
      '  ' +
      chalk.cyan(session.id.slice(0, 36).padEnd(38)) +
      statusColor(statusText).padEnd(12) +
      (workflow?.name || session.workflowId).slice(0, 22).padEnd(24) +
      chalk.gray(dateStr)
    );

    // Show additional info for zombies
    if (isZombie) {
      console.log(chalk.red('    ⚠ No active run - may need cleanup'));
    }
  }

  console.log();

  // Summary
  const stats = {
    running: sessions.filter(s => s.status === 'running').length,
    completed: sessions.filter(s => s.status === 'completed').length,
    failed: sessions.filter(s => s.status === 'failed').length,
    paused: sessions.filter(s => s.status === 'paused').length
  };

  console.log(chalk.gray('Summary:'));
  console.log(
    chalk.gray('  ') +
    chalk.blue(`Running: ${stats.running}`) + '  ' +
    chalk.green(`Completed: ${stats.completed}`) + '  ' +
    chalk.red(`Failed: ${stats.failed}`) + '  ' +
    chalk.yellow(`Paused: ${stats.paused}`)
  );

  // Zombie warning
  const zombies = sessions.filter(s =>
    s.status === 'running' && !engine.hasActiveRun(s.id)
  );
  if (zombies.length > 0) {
    console.log();
    console.log(chalk.red(`⚠ Found ${zombies.length} zombie session(s)`));
    console.log(chalk.gray('  Use "agentic-builder list --zombies" to see them'));
    console.log(chalk.gray('  Use "agentic-builder cancel <id> --force" to clean up'));
  }
}

export default listCommand;
