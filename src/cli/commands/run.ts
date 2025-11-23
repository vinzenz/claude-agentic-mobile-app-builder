/**
 * Run Command - Start workflow execution
 * Handles signal handlers for graceful shutdown
 */

import chalk from 'chalk';
import ora from 'ora';
import { getWorkflowEngine } from '../../../orchestration/workflow-engine.js';
import { getWorkflow, getWorkflowIds } from '../../../orchestration/predefined-workflows.js';
import { getModelSelector } from '../../../orchestration/model-selector.js';
import { isClaudeAvailable } from '../../claude-cli/index.js';

interface RunOptions {
  project?: string;
  description?: string;
  maxTier?: string;
  branch?: boolean;
  pr?: boolean;
  dryRun?: boolean;
}

export async function runCommand(workflowId: string, options: RunOptions): Promise<void> {
  const spinner = ora();

  // Validate workflow
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    console.error(chalk.red(`Unknown workflow: ${workflowId}`));
    console.log(chalk.gray(`Available workflows: ${getWorkflowIds().join(', ')}`));
    process.exit(1);
  }

  // Check Claude availability
  spinner.start('Checking Claude CLI availability...');
  const claudeAvailable = await isClaudeAvailable();
  if (!claudeAvailable) {
    spinner.fail('Claude CLI is not available');
    console.error(chalk.red('Please ensure Claude CLI is installed and in your PATH'));
    process.exit(1);
  }
  spinner.succeed('Claude CLI available');

  // Configure model selector
  if (options.maxTier) {
    const modelSelector = getModelSelector();
    modelSelector.configure({ maxTier: options.maxTier });
  }

  // Build context
  const context = {
    projectName: options.project || 'mobile-app',
    description: options.description || '',
    timestamp: new Date().toISOString()
  };

  // Dry run - show what would be executed
  if (options.dryRun) {
    console.log(chalk.bold('\nDry Run - Workflow Plan:\n'));
    console.log(chalk.cyan(`Workflow: ${workflow.name}`));
    console.log(chalk.gray(workflow.description));
    console.log();

    console.log(chalk.bold('Stages:'));
    for (let i = 0; i < workflow.stages.length; i++) {
      const stage = workflow.stages[i];
      console.log(chalk.yellow(`\n  Stage ${i + 1}: ${stage.name}`));
      console.log(chalk.gray(`    ${stage.description}`));
      console.log(chalk.gray(`    Mode: ${stage.executionMode}`));
      console.log(chalk.gray(`    Agents: ${stage.agents.join(', ')}`));
    }
    return;
  }

  // Setup signal handlers for graceful shutdown
  const engine = getWorkflowEngine();
  let currentRunId: string | null = null;
  let shuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(chalk.yellow(`\nReceived ${signal}, shutting down gracefully...`));

    if (currentRunId) {
      try {
        await engine.cancelWorkflow(currentRunId, { cleanup: false });
        console.log(chalk.yellow('Workflow cancelled. Session saved for resumption.'));
      } catch (error) {
        console.error(chalk.red('Error during shutdown:', error));
      }
    }

    process.exit(130);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGHUP', () => handleShutdown('SIGHUP'));

  // Setup event listeners
  engine.on('workflow_started', ({ runId, sessionId }) => {
    currentRunId = runId;
    console.log(chalk.green(`\nWorkflow started`));
    console.log(chalk.gray(`  Run ID: ${runId}`));
    console.log(chalk.gray(`  Session ID: ${sessionId}`));
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

  // Start workflow
  console.log(chalk.bold(`\nStarting ${workflow.name}...`));
  console.log(chalk.gray(`Project: ${context.projectName}`));

  try {
    const run = await engine.startWorkflow(workflow, context, {
      createBranch: options.branch !== false,
      createPR: options.pr !== false
    });

    console.log(chalk.bold.green('\n✓ Workflow completed successfully!'));
    console.log(chalk.gray(`  Session: ${run.sessionId}`));
    if (run.gitBranch) {
      console.log(chalk.gray(`  Branch: ${run.gitBranch}`));
    }
    if (run.prUrl) {
      console.log(chalk.gray(`  PR: ${run.prUrl}`));
    }

    // Summary
    const completedAgents = run.agentExecutions.filter(e => e.status === 'completed').length;
    const totalAgents = run.agentExecutions.length;
    console.log(chalk.gray(`  Agents: ${completedAgents}/${totalAgents} completed`));

  } catch (error: any) {
    spinner.fail('Workflow failed');
    console.error(chalk.red(`\nError: ${error.message}`));
    console.log(chalk.yellow('\nUse "agentic-builder resume <session-id>" to retry from last checkpoint'));
    process.exit(1);
  }
}

export default runCommand;
