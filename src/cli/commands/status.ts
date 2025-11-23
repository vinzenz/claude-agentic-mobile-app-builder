/**
 * Status Command - Show run details
 */

import chalk from 'chalk';
import { getSessionManager } from '../../../orchestration/session-manager.js';
import { getWorkflowEngine } from '../../../orchestration/workflow-engine.js';
import { getWorkflow } from '../../../orchestration/predefined-workflows.js';
import { getAgentConfig } from '../../../orchestration/agent-configs.js';

interface StatusOptions {
  verbose?: boolean;
  json?: boolean;
}

export async function statusCommand(id: string, options: StatusOptions): Promise<void> {
  const sessionManager = getSessionManager();
  const engine = getWorkflowEngine();

  // Try to find session
  const session = sessionManager.getSession(id);

  if (!session) {
    console.error(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  // Get workflow info
  const workflow = getWorkflow(session.workflowId);

  // Check if session has active run (for zombie detection)
  const hasActiveRun = engine.hasActiveRun(session.id);
  const isZombie = session.status === 'running' && !hasActiveRun;

  // Header
  console.log(chalk.bold(`\nSession: ${session.id}`));
  console.log();

  // Status with color
  const statusColor = {
    running: chalk.blue,
    completed: chalk.green,
    failed: chalk.red,
    paused: chalk.yellow
  }[session.status] || chalk.gray;

  let statusText = session.status.toUpperCase();
  if (isZombie) {
    statusText += chalk.red(' (ZOMBIE)');
  }

  console.log(`  ${chalk.gray('Status:')} ${statusColor(statusText)}`);
  console.log(`  ${chalk.gray('Workflow:')} ${workflow?.name || session.workflowId}`);
  console.log(`  ${chalk.gray('Created:')} ${new Date(session.createdAt).toLocaleString()}`);
  console.log(`  ${chalk.gray('Updated:')} ${new Date(session.updatedAt).toLocaleString()}`);

  // Context
  if (session.context.projectName) {
    console.log(`  ${chalk.gray('Project:')} ${session.context.projectName}`);
  }
  if (session.context.gitBranch) {
    console.log(`  ${chalk.gray('Branch:')} ${session.context.gitBranch}`);
  }

  // Progress
  console.log();
  console.log(chalk.bold('Progress:'));
  console.log(`  ${chalk.gray('Current Stage:')} ${session.currentStage + 1}/${workflow?.stages.length || '?'}`);
  console.log(`  ${chalk.gray('Completed Agents:')} ${session.completedAgents.length}`);
  console.log(`  ${chalk.gray('Checkpoints:')} ${session.checkpoints.length}`);

  // Agent executions
  if (session.metadata.agentExecutions.length > 0 && options.verbose) {
    console.log();
    console.log(chalk.bold('Agent Executions:'));

    for (const exec of session.metadata.agentExecutions) {
      const config = getAgentConfig(exec.agentType);
      const statusIcon = exec.status === 'completed' ? chalk.green('✓') :
                         exec.status === 'failed' ? chalk.red('✗') :
                         chalk.yellow('○');

      console.log(`  ${statusIcon} ${config?.name || exec.agentType}`);

      if (exec.tokensUsed) {
        console.log(chalk.gray(`      Tokens: ${exec.tokensUsed}`));
      }
      if (exec.executionTime) {
        console.log(chalk.gray(`      Time: ${(exec.executionTime / 1000).toFixed(1)}s`));
      }
      if (exec.error) {
        console.log(chalk.red(`      Error: ${exec.error}`));
      }
    }
  }

  // Statistics
  console.log();
  console.log(chalk.bold('Statistics:'));
  console.log(`  ${chalk.gray('Total Tokens:')} ${session.metadata.totalTokens.toLocaleString()}`);
  console.log(`  ${chalk.gray('Execution Time:')} ${(session.metadata.totalExecutionTime / 1000 / 60).toFixed(1)} minutes`);

  // Error info
  if (session.error) {
    console.log();
    console.log(chalk.red('Error:'));
    console.log(chalk.red(`  ${session.error}`));
  }

  // Checkpoints (verbose)
  if (session.checkpoints.length > 0 && options.verbose) {
    console.log();
    console.log(chalk.bold('Checkpoints:'));

    for (const checkpoint of session.checkpoints) {
      console.log(`  ${chalk.gray('•')} Stage ${checkpoint.stageIndex + 1}: ${checkpoint.stageName}`);
      console.log(chalk.gray(`      ${new Date(checkpoint.timestamp).toLocaleString()}`));
    }
  }

  // Actions hint
  console.log();
  if (isZombie) {
    console.log(chalk.yellow('This session appears to be a zombie. Use:'));
    console.log(chalk.gray(`  agentic-builder cancel ${session.id} --force`));
  } else if (session.status === 'failed' || session.status === 'paused') {
    console.log(chalk.yellow('To resume this session:'));
    console.log(chalk.gray(`  agentic-builder resume ${session.id}`));
  } else if (session.status === 'running') {
    console.log(chalk.yellow('To cancel this workflow:'));
    console.log(chalk.gray(`  agentic-builder cancel ${session.id}`));
  }
}

export default statusCommand;
