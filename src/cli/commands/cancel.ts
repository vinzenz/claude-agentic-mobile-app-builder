/**
 * Cancel Command - Cancel a running workflow
 * Includes zombie detection and cleanup options
 */

import chalk from 'chalk';
import { getSessionManager } from '../../../orchestration/session-manager.js';
import { getWorkflowEngine } from '../../../orchestration/workflow-engine.js';
import readline from 'readline';

interface CancelOptions {
  force?: boolean;
  cleanup?: boolean;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function cancelCommand(id: string, options: CancelOptions): Promise<void> {
  const sessionManager = getSessionManager();
  const engine = getWorkflowEngine();

  // Find session
  const session = sessionManager.getSession(id);
  if (!session) {
    console.error(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }

  // Check if already completed/cancelled
  if (session.status === 'completed') {
    console.log(chalk.yellow('Session is already completed.'));
    return;
  }

  // Check if it's a zombie
  const isZombie = session.status === 'running' && !engine.hasActiveRun(session.id);

  if (isZombie) {
    console.log(chalk.yellow('\nThis session appears to be a zombie (no active run).'));

    if (!options.force) {
      const confirmed = await confirm('Mark as failed and clean up?');
      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    // Mark session as failed
    sessionManager.markFailed(session.id, 'Cancelled - zombie session cleanup');
    console.log(chalk.green('Session marked as failed.'));

    if (options.cleanup && session.context.gitBranch) {
      try {
        const { getGitManager } = await import('../../git/git-manager.js');
        const gitManager = getGitManager();
        await gitManager.deleteBranch(session.context.gitBranch, true);
        console.log(chalk.gray(`Deleted branch: ${session.context.gitBranch}`));
      } catch (error: any) {
        console.log(chalk.yellow(`Could not delete branch: ${error.message}`));
      }
    }

    return;
  }

  // Active run - need to cancel properly
  const activeRuns = engine.getActiveRuns().filter(r => r.sessionId === session.id);

  if (activeRuns.length === 0) {
    // No active run but status is running - this is a zombie
    console.log(chalk.yellow('No active run found for this session.'));

    if (!options.force) {
      const confirmed = await confirm('Mark session as failed?');
      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    sessionManager.markFailed(session.id, 'Cancelled by user');
    console.log(chalk.green('Session marked as failed.'));
    return;
  }

  // Confirm cancellation
  if (!options.force) {
    console.log(chalk.yellow(`\nThis will cancel the running workflow:`));
    console.log(chalk.gray(`  Session: ${session.id}`));
    console.log(chalk.gray(`  Workflow: ${session.workflowId}`));
    console.log(chalk.gray(`  Stage: ${session.currentStage + 1}`));

    const confirmed = await confirm('\nProceed with cancellation?');
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
  }

  // Cancel each active run
  for (const run of activeRuns) {
    try {
      console.log(chalk.yellow(`Cancelling run: ${run.id}`));
      await engine.cancelWorkflow(run.id, { cleanup: options.cleanup });
      console.log(chalk.green('Run cancelled.'));
    } catch (error: any) {
      console.error(chalk.red(`Error cancelling run: ${error.message}`));
    }
  }

  // Final status
  const updatedSession = sessionManager.getSession(id);
  console.log(chalk.green(`\nSession status: ${updatedSession?.status}`));

  if (session.checkpoints.length > 0) {
    console.log(chalk.gray(`Checkpoints available: ${session.checkpoints.length}`));
    console.log(chalk.gray(`Use "agentic-builder resume ${session.id}" to continue later.`));
  }
}

export default cancelCommand;
