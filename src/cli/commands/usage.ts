/**
 * Usage Command - Token usage statistics
 */

import chalk from 'chalk';
import { getSessionManager } from '../../../orchestration/session-manager.js';
import { getAgentConfig, getAllAgentTypes } from '../../../orchestration/agent-configs.js';
import { ModelTier } from '../../../orchestration/types.js';

interface UsageOptions {
  session?: string;
  since?: string;
  breakdown?: boolean;
}

export async function usageCommand(options: UsageOptions): Promise<void> {
  const sessionManager = getSessionManager();

  // Single session usage
  if (options.session) {
    await showSessionUsage(options.session);
    return;
  }

  // Get all sessions
  let sessions = sessionManager.listSessions();

  // Filter by date if specified
  if (options.since) {
    const sinceDate = new Date(options.since);
    sessions = sessions.filter(s => new Date(s.createdAt) >= sinceDate);
  }

  if (sessions.length === 0) {
    console.log(chalk.gray('\nNo sessions found.'));
    return;
  }

  // Aggregate statistics
  const stats = {
    totalTokens: 0,
    totalExecutionTime: 0,
    sessionCount: sessions.length,
    completedSessions: 0,
    failedSessions: 0,
    agentUsage: new Map<string, { tokens: number; executions: number; time: number }>()
  };

  // Initialize agent usage
  for (const type of getAllAgentTypes()) {
    stats.agentUsage.set(type, { tokens: 0, executions: 0, time: 0 });
  }

  // Aggregate
  for (const session of sessions) {
    stats.totalTokens += session.metadata.totalTokens;
    stats.totalExecutionTime += session.metadata.totalExecutionTime;

    if (session.status === 'completed') stats.completedSessions++;
    if (session.status === 'failed') stats.failedSessions++;

    // Agent breakdown
    for (const exec of session.metadata.agentExecutions) {
      const usage = stats.agentUsage.get(exec.agentType);
      if (usage) {
        usage.tokens += exec.tokensUsed || 0;
        usage.executions++;
        usage.time += exec.executionTime || 0;
      }
    }
  }

  // Display summary
  console.log(chalk.bold('\nToken Usage Summary\n'));

  console.log(`  ${chalk.gray('Sessions:')} ${stats.sessionCount}`);
  console.log(`  ${chalk.gray('Completed:')} ${chalk.green(stats.completedSessions.toString())}`);
  console.log(`  ${chalk.gray('Failed:')} ${chalk.red(stats.failedSessions.toString())}`);
  console.log();
  console.log(`  ${chalk.gray('Total Tokens:')} ${stats.totalTokens.toLocaleString()}`);
  console.log(`  ${chalk.gray('Total Time:')} ${formatDuration(stats.totalExecutionTime)}`);

  // Estimate cost (very rough)
  const estimatedCost = estimateTokenCost(stats.totalTokens);
  console.log(`  ${chalk.gray('Est. Cost:')} $${estimatedCost.toFixed(2)}`);

  // Agent breakdown
  if (options.breakdown) {
    console.log(chalk.bold('\nBreakdown by Agent:\n'));

    console.log(
      chalk.gray(
        '  ' +
        'AGENT'.padEnd(16) +
        'TOKENS'.padEnd(14) +
        'EXECUTIONS'.padEnd(12) +
        'AVG TIME'.padEnd(12) +
        'MODEL'
      )
    );
    console.log(chalk.gray('  ' + '-'.repeat(70)));

    const sortedAgents = [...stats.agentUsage.entries()]
      .filter(([, usage]) => usage.executions > 0)
      .sort((a, b) => b[1].tokens - a[1].tokens);

    for (const [type, usage] of sortedAgents) {
      const config = getAgentConfig(type);
      const avgTime = usage.executions > 0 ? usage.time / usage.executions : 0;

      const tierColor = config?.defaultModel === ModelTier.OPUS ? chalk.magenta :
                        config?.defaultModel === ModelTier.SONNET ? chalk.blue :
                        chalk.green;

      console.log(
        '  ' +
        chalk.cyan(type.padEnd(16)) +
        usage.tokens.toLocaleString().padEnd(14) +
        usage.executions.toString().padEnd(12) +
        formatDuration(avgTime).padEnd(12) +
        tierColor(config?.defaultModel || 'unknown')
      );
    }
  }

  // Model tier breakdown
  console.log(chalk.bold('\nBreakdown by Model Tier:\n'));

  const tierStats = new Map<string, { tokens: number; executions: number }>();
  for (const tier of Object.values(ModelTier)) {
    tierStats.set(tier, { tokens: 0, executions: 0 });
  }

  for (const [type, usage] of stats.agentUsage.entries()) {
    const config = getAgentConfig(type);
    const tier = config?.defaultModel || ModelTier.SONNET;
    const tierUsage = tierStats.get(tier);
    if (tierUsage) {
      tierUsage.tokens += usage.tokens;
      tierUsage.executions += usage.executions;
    }
  }

  for (const [tier, usage] of tierStats.entries()) {
    if (usage.executions > 0) {
      const tierColor = tier === ModelTier.OPUS ? chalk.magenta :
                        tier === ModelTier.SONNET ? chalk.blue :
                        chalk.green;

      console.log(
        '  ' +
        tierColor(tier.toUpperCase().padEnd(10)) +
        `${usage.tokens.toLocaleString()} tokens`.padEnd(20) +
        `${usage.executions} executions`
      );
    }
  }

  // Tips
  console.log(chalk.bold('\nCost Optimization Tips:'));
  console.log(chalk.gray('  • Use --max-tier haiku for simple tasks'));
  console.log(chalk.gray('  • Use --max-tier sonnet for most workflows'));
  console.log(chalk.gray('  • Reserve opus tier for complex planning/security tasks'));
}

async function showSessionUsage(sessionId: string): Promise<void> {
  const sessionManager = getSessionManager();
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    console.error(chalk.red(`Session not found: ${sessionId}`));
    process.exit(1);
  }

  console.log(chalk.bold(`\nUsage for Session: ${sessionId}\n`));

  console.log(`  ${chalk.gray('Status:')} ${session.status}`);
  console.log(`  ${chalk.gray('Workflow:')} ${session.workflowId}`);
  console.log(`  ${chalk.gray('Total Tokens:')} ${session.metadata.totalTokens.toLocaleString()}`);
  console.log(`  ${chalk.gray('Total Time:')} ${formatDuration(session.metadata.totalExecutionTime)}`);

  const estimatedCost = estimateTokenCost(session.metadata.totalTokens);
  console.log(`  ${chalk.gray('Est. Cost:')} $${estimatedCost.toFixed(4)}`);

  if (session.metadata.agentExecutions.length > 0) {
    console.log(chalk.bold('\nAgent Executions:\n'));

    for (const exec of session.metadata.agentExecutions) {
      const config = getAgentConfig(exec.agentType);
      const statusIcon = exec.status === 'completed' ? chalk.green('✓') :
                         exec.status === 'failed' ? chalk.red('✗') : chalk.yellow('○');

      console.log(`  ${statusIcon} ${chalk.cyan(exec.agentType.padEnd(14))}`);
      console.log(chalk.gray(`      Tokens: ${(exec.tokensUsed || 0).toLocaleString()}`));
      console.log(chalk.gray(`      Time: ${formatDuration(exec.executionTime || 0)}`));
      if (exec.error) {
        console.log(chalk.red(`      Error: ${exec.error}`));
      }
    }
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function estimateTokenCost(tokens: number): number {
  // Very rough estimate assuming average pricing
  // Input: ~$3/M tokens, Output: ~$15/M tokens
  // Assuming 70% input, 30% output
  const inputCost = (tokens * 0.7) * 0.000003;
  const outputCost = (tokens * 0.3) * 0.000015;
  return inputCost + outputCost;
}

export default usageCommand;
