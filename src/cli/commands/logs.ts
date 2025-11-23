/**
 * Logs Command - View execution logs
 */

import chalk from 'chalk';
import { getSessionManager } from '../../../orchestration/session-manager.js';

interface LogsOptions {
  follow?: boolean;
  lines?: string;
  level?: string;
}

export async function logsCommand(id: string, options: LogsOptions): Promise<void> {
  const sessionManager = getSessionManager();

  // Find session
  const session = sessionManager.getSession(id);
  if (!session) {
    console.error(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }

  // Get logs
  let logs = sessionManager.getLogs(id);
  const limit = parseInt(options.lines || '50');

  // Filter by level if specified
  if (options.level) {
    logs = logs.filter(log => log.level === options.level || log.type?.includes(options.level));
  }

  // Limit to last N logs
  logs = logs.slice(-limit);

  if (logs.length === 0) {
    console.log(chalk.gray('\nNo logs found for this session.'));
    return;
  }

  console.log(chalk.bold(`\nLogs for session: ${id}\n`));

  // Display logs
  for (const log of logs) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const typeColor = getLogTypeColor(log.type);

    console.log(
      chalk.gray(`[${timestamp}]`) + ' ' +
      typeColor(`[${log.type}]`) + ' ' +
      formatLogMessage(log)
    );
  }

  // Follow mode
  if (options.follow && session.status === 'running') {
    console.log(chalk.gray('\n--- Following logs (Ctrl+C to exit) ---\n'));

    let lastLogCount = logs.length;

    const interval = setInterval(() => {
      const currentLogs = sessionManager.getLogs(id);

      if (currentLogs.length > lastLogCount) {
        const newLogs = currentLogs.slice(lastLogCount);

        for (const log of newLogs) {
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          const typeColor = getLogTypeColor(log.type);

          console.log(
            chalk.gray(`[${timestamp}]`) + ' ' +
            typeColor(`[${log.type}]`) + ' ' +
            formatLogMessage(log)
          );
        }

        lastLogCount = currentLogs.length;
      }

      // Check if session completed
      const currentSession = sessionManager.getSession(id);
      if (currentSession && currentSession.status !== 'running') {
        console.log(chalk.gray(`\n--- Session ${currentSession.status} ---`));
        clearInterval(interval);
        process.exit(0);
      }
    }, 1000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log(chalk.gray('\n--- Stopped following ---'));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }
}

function getLogTypeColor(type: string): (text: string) => string {
  if (type?.includes('started') || type?.includes('spawned')) {
    return chalk.blue;
  }
  if (type?.includes('completed')) {
    return chalk.green;
  }
  if (type?.includes('failed') || type?.includes('error')) {
    return chalk.red;
  }
  if (type?.includes('warning')) {
    return chalk.yellow;
  }
  if (type?.includes('retry')) {
    return chalk.magenta;
  }
  return chalk.gray;
}

function formatLogMessage(log: any): string {
  const parts: string[] = [];

  if (log.agentType) {
    parts.push(chalk.cyan(log.agentType));
  }
  if (log.stageName) {
    parts.push(`Stage: ${log.stageName}`);
  }
  if (log.stageIndex !== undefined) {
    parts.push(`Stage ${log.stageIndex + 1}`);
  }
  if (log.error) {
    parts.push(chalk.red(log.error));
  }
  if (log.message) {
    parts.push(log.message);
  }
  if (log.workflowId) {
    parts.push(`Workflow: ${log.workflowId}`);
  }
  if (log.runId) {
    parts.push(chalk.gray(`Run: ${log.runId.slice(0, 8)}`));
  }
  if (log.model) {
    parts.push(chalk.gray(`Model: ${log.model}`));
  }
  if (log.attempt) {
    parts.push(chalk.yellow(`Attempt: ${log.attempt}`));
  }
  if (log.prUrl) {
    parts.push(`PR: ${log.prUrl}`);
  }

  return parts.join(' | ') || log.type;
}

export default logsCommand;
