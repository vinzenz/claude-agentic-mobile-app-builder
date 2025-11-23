/**
 * Resume Command - Resume workflow from checkpoint
 */

import chalk from 'chalk';
import ora from 'ora';
import { getSessionManager } from '../../../orchestration/session-manager.js';
import { getWorkflowEngine } from '../../../orchestration/workflow-engine.js';
import { getWorkflow } from '../../../orchestration/predefined-workflows.js';

interface ResumeOptions {
  fromStage?: string;
}

export async function resumeCommand(id: string, options: ResumeOptions): Promise<void> {
  const spinner = ora();
  const sessionManager = getSessionManager();
  const engine = getWorkflowEngine();

  // Find session
  const session = sessionManager.getSession(id);
  if (!session) {
    console.error(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }

  // Check if resumable
  if (!sessionManager.isResumable(id)) {
    if (session.status === 'completed') {
      console.log(chalk.yellow('Session is already completed.'));
    } else if (session.status === 'running') {
      console.log(chalk.yellow('Session is currently running.'));
    } else {
      console.log(chalk.red('Session cannot be resumed (no checkpoints available).'));
    }
    process.exit(1);
  }

  // Get workflow info
  const workflow = getWorkflow(session.workflowId);
  if (!workflow) {
    console.error(chalk.red(`Unknown workflow: ${session.workflowId}`));
    process.exit(1);
  }

  // Display resume info
  const latestCheckpoint = session.checkpoints[session.checkpoints.length - 1];
  const resumeStage = options.fromStage
    ? parseInt(options.fromStage) - 1
    : (latestCheckpoint?.stageIndex ?? -1) + 1;

  console.log(chalk.bold('\nResume Workflow'));
  console.log(chalk.gray(`  Session: ${session.id}`));
  console.log(chalk.gray(`  Workflow: ${workflow.name}`));
  console.log(chalk.gray(`  Previous status: ${session.status}`));

  if (latestCheckpoint) {
    console.log(chalk.gray(`  Last checkpoint: Stage ${latestCheckpoint.stageIndex + 1} (${latestCheckpoint.stageName})`));
  }

  console.log(chalk.gray(`  Resuming from: Stage ${resumeStage + 1}`));
  console.log(chalk.gray(`  Completed agents: ${session.completedAgents.join(', ') || 'none'}`));
  console.log();

  // Setup signal handlers
  let currentRunId: string | null = null;
  let shuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(chalk.yellow(`\nReceived ${signal}, shutting down...`));

    if (currentRunId) {
      try {
        await engine.cancelWorkflow(currentRunId, { cleanup: false });
      } catch (error) {
        // Ignore
      }
    }

    process.exit(130);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Setup event listeners
  engine.on('workflow_resumed', ({ runId, fromStage }) => {
    currentRunId = runId;
    console.log(chalk.green(`Workflow resumed from stage ${fromStage + 1}`));
  });

  engine.on('stage_started', ({ stageIndex, stageName }) => {
    console.log(chalk.cyan(`\n▶ Stage ${stageIndex + 1}: ${stageName}`));
  });

  engine.on('agent_spawned', ({ agentType }) => {
    spinner.start(`  Executing ${agentType}...`);
  });

  engine.on('agent_completed', ({ agentType, output }) => {
    spinner.succeed(`  ${agentType} completed`);
    if (output?.summary) {
      console.log(chalk.gray(`    ${output.summary.slice(0, 100)}...`));
    }
  });

  engine.on('agent_failed', ({ agentType, error }) => {
    spinner.fail(`  ${agentType} failed: ${error}`);
  });

  engine.on('stage_completed', ({ stageName }) => {
    console.log(chalk.green(`✓ Stage completed: ${stageName}`));
  });

  // Resume workflow
  try {
    spinner.start('Resuming workflow...');
    const run = await engine.resumeWorkflow(id);
    spinner.stop();

    console.log(chalk.bold.green('\n✓ Workflow completed successfully!'));
    console.log(chalk.gray(`  Session: ${run.sessionId}`));
    if (run.gitBranch) {
      console.log(chalk.gray(`  Branch: ${run.gitBranch}`));
    }
    if (run.prUrl) {
      console.log(chalk.gray(`  PR: ${run.prUrl}`));
    }

  } catch (error: any) {
    spinner.fail('Resume failed');
    console.error(chalk.red(`\nError: ${error.message}`));

    // Check if we can retry
    const updatedSession = sessionManager.getSession(id);
    if (updatedSession && sessionManager.isResumable(id)) {
      console.log(chalk.yellow('\nSession saved. Use "agentic-builder resume <id>" to retry.'));
    }

    process.exit(1);
  }
}

export default resumeCommand;
