/**
 * Claude CLI Integration
 * Executes Claude in headless mode for agent tasks
 */

import { spawn } from 'child_process';
import { getPromptLoader, buildAgentPrompt } from '../agents/prompt-loader.js';
import { getAgentConfig } from '../../orchestration/agent-configs.js';

/**
 * Execute an agent via Claude CLI
 * @param {Object} params - Execution parameters
 * @returns {Promise<string>} - Agent response
 */
export async function executeAgent(params) {
  const {
    agentType,
    taskId,
    context,
    model,
    timeout = 300000, // 5 minutes default
    workingDir = process.cwd()
  } = params;

  const agentConfig = getAgentConfig(agentType);
  if (!agentConfig) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  // Build the full prompt
  const promptLoader = getPromptLoader();
  const fullPrompt = buildAgentPrompt(agentType, context, {
    variables: { taskId }
  });

  // Execute Claude CLI in headless mode
  return executeClaude({
    prompt: fullPrompt,
    model,
    timeout,
    workingDir,
    agentType,
    taskId
  });
}

/**
 * Execute Claude CLI
 * @param {Object} options - Execution options
 * @returns {Promise<string>}
 */
export async function executeClaude(options) {
  const {
    prompt,
    model,
    timeout = 300000,
    workingDir = process.cwd(),
    agentType,
    taskId
  } = options;

  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    let timedOut = false;

    // Build Claude CLI arguments
    const args = [
      '--print',           // Print response without interactive mode
      '--dangerously-skip-permissions' // Skip permission prompts for automation
    ];

    // Add model if specified
    if (model) {
      args.push('--model', model);
    }

    // Add prompt as argument
    args.push('--prompt', prompt);

    // Spawn Claude process
    const claudeProcess = spawn('claude', args, {
      cwd: workingDir,
      env: {
        ...process.env,
        CLAUDE_CODE_HEADLESS: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      claudeProcess.kill('SIGTERM');
    }, timeout);

    // Collect stdout
    claudeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Collect stderr
    claudeProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // Handle process exit
    claudeProcess.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Agent ${agentType} (${taskId}) timed out after ${timeout}ms`));
        return;
      }

      if (code !== 0 && !output) {
        reject(new Error(`Claude CLI exited with code ${code}: ${errorOutput}`));
        return;
      }

      resolve(output);
    });

    claudeProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to execute Claude CLI: ${error.message}`));
    });
  });
}

/**
 * Execute Claude with streaming output
 * @param {Object} options - Execution options
 * @param {Function} onData - Callback for streamed data
 * @returns {Promise<string>}
 */
export async function executeClaudeStreaming(options, onData) {
  const {
    prompt,
    model,
    timeout = 300000,
    workingDir = process.cwd()
  } = options;

  return new Promise((resolve, reject) => {
    let output = '';
    let timedOut = false;

    const args = ['--print'];
    if (model) {
      args.push('--model', model);
    }
    args.push('--prompt', prompt);

    const claudeProcess = spawn('claude', args, {
      cwd: workingDir,
      env: {
        ...process.env,
        CLAUDE_CODE_HEADLESS: '1'
      }
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      claudeProcess.kill('SIGTERM');
    }, timeout);

    claudeProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      if (onData) {
        onData(chunk);
      }
    });

    claudeProcess.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Execution timed out after ${timeout}ms`));
        return;
      }

      if (code !== 0 && !output) {
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      resolve(output);
    });

    claudeProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to execute Claude CLI: ${error.message}`));
    });
  });
}

/**
 * Check if Claude CLI is available
 * @returns {Promise<boolean>}
 */
export async function isClaudeAvailable() {
  return new Promise((resolve) => {
    const process = spawn('claude', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    process.on('close', (code) => {
      resolve(code === 0);
    });

    process.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Get Claude CLI version
 * @returns {Promise<string|null>}
 */
export async function getClaudeVersion() {
  return new Promise((resolve) => {
    let output = '';

    const process = spawn('claude', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        resolve(null);
      }
    });

    process.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Execute a simple prompt without agent context
 * @param {string} prompt - Prompt text
 * @param {Object} [options] - Options
 * @returns {Promise<string>}
 */
export async function executePrompt(prompt, options = {}) {
  return executeClaude({
    prompt,
    model: options.model,
    timeout: options.timeout,
    workingDir: options.workingDir
  });
}

/**
 * Execute Claude with file context
 * @param {string} prompt - Prompt text
 * @param {string[]} files - Files to include as context
 * @param {Object} [options] - Options
 * @returns {Promise<string>}
 */
export async function executeWithFiles(prompt, files, options = {}) {
  // Build prompt with file contents
  let fullPrompt = prompt;

  if (files && files.length > 0) {
    fullPrompt += '\n\n## Files\n';
    for (const file of files) {
      fullPrompt += `\n### ${file}\n`;
      // Note: File reading would be done by Claude CLI
    }
  }

  return executeClaude({
    prompt: fullPrompt,
    model: options.model,
    timeout: options.timeout,
    workingDir: options.workingDir
  });
}

/**
 * Create a batch execution runner
 * @param {Object[]} tasks - Tasks to execute
 * @param {Object} [options] - Options
 * @returns {Promise<Object[]>}
 */
export async function executeBatch(tasks, options = {}) {
  const { concurrency = 3 } = options;
  const results = [];
  const queue = [...tasks];

  async function processTask(task) {
    try {
      const result = await executeAgent(task);
      return { success: true, taskId: task.taskId, result };
    } catch (error) {
      return { success: false, taskId: task.taskId, error: error.message };
    }
  }

  // Process in batches
  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(batch.map(processTask));
    results.push(...batchResults);
  }

  return results;
}

export default {
  executeAgent,
  executeClaude,
  executeClaudeStreaming,
  isClaudeAvailable,
  getClaudeVersion,
  executePrompt,
  executeWithFiles,
  executeBatch
};
