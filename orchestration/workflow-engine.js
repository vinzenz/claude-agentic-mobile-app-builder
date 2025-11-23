/**
 * Workflow Engine - Main orchestrator for multi-agent workflows
 * Singleton, extends EventEmitter
 * Coordinates agent execution, manages workflow runs, integrates with PMS and Git
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowStatus, AgentStatus, StageExecutionMode } from './types.js';
import { getSessionManager } from './session-manager.js';
import { getAgentConfig, topologicalSortAgents } from './agent-configs.js';
import { selectModelForAgent, getModelCliArgForAgent } from './model-selector.js';
import { getWorkflow } from './predefined-workflows.js';

/**
 * WorkflowEngine singleton class
 * Manages workflow execution lifecycle
 */
class WorkflowEngine extends EventEmitter {
  constructor() {
    super();
    this.activeRuns = new Map();
    this.sessionManager = getSessionManager();

    // Lazy-loaded dependencies (to avoid circular imports)
    this._taskManager = null;
    this._contextSerializer = null;
    this._claudeCli = null;
    this._responseParser = null;
    this._gitManager = null;
    this._prManager = null;
  }

  /**
   * Get TaskManager (lazy load)
   */
  async getTaskManager() {
    if (!this._taskManager) {
      const { getTaskManager } = await import('../pms/task-manager.js');
      this._taskManager = getTaskManager();
    }
    return this._taskManager;
  }

  /**
   * Get ContextSerializer (lazy load)
   */
  async getContextSerializer() {
    if (!this._contextSerializer) {
      const { getContextSerializer } = await import('../pms/context-serializer.js');
      this._contextSerializer = getContextSerializer();
    }
    return this._contextSerializer;
  }

  /**
   * Get Claude CLI (lazy load)
   */
  async getClaudeCli() {
    if (!this._claudeCli) {
      const claudeCli = await import('../src/claude-cli/index.js');
      this._claudeCli = claudeCli;
    }
    return this._claudeCli;
  }

  /**
   * Get ResponseParser (lazy load)
   */
  async getResponseParser() {
    if (!this._responseParser) {
      const { parseAgentResponse } = await import('../src/agents/response-parser.js');
      this._responseParser = { parseAgentResponse };
    }
    return this._responseParser;
  }

  /**
   * Get GitManager (lazy load)
   */
  async getGitManager() {
    if (!this._gitManager) {
      const { getGitManager } = await import('../src/git/git-manager.js');
      this._gitManager = getGitManager();
    }
    return this._gitManager;
  }

  /**
   * Get PRManager (lazy load)
   */
  async getPRManager() {
    if (!this._prManager) {
      const { getPRManager } = await import('../src/git/pr-manager.js');
      this._prManager = getPRManager();
    }
    return this._prManager;
  }

  /**
   * Start a workflow execution
   * @param {Object|string} definition - Workflow definition or ID
   * @param {Object} context - Execution context
   * @param {Object} [options] - Execution options
   * @returns {Object} - WorkflowRun
   */
  async startWorkflow(definition, context, options = {}) {
    // Resolve workflow definition
    const workflowDef = typeof definition === 'string'
      ? getWorkflow(definition)
      : definition;

    if (!workflowDef) {
      throw new Error(`Unknown workflow: ${definition}`);
    }

    // Create session
    const session = this.sessionManager.createSession({
      workflowId: workflowDef.id,
      context,
      options
    });

    // Create workflow run
    const run = {
      id: uuidv4(),
      workflowId: workflowDef.id,
      workflowDef,
      sessionId: session.id,
      status: WorkflowStatus.RUNNING,
      context: { ...context },
      currentStageIndex: 0,
      agentExecutions: [],
      completedAgents: new Set(),
      startTime: new Date(),
      endTime: null,
      gitBranch: null,
      error: null,
      options
    };

    this.activeRuns.set(run.id, run);

    this.emit('workflow_started', {
      runId: run.id,
      workflowId: workflowDef.id,
      sessionId: session.id
    });

    this.sessionManager.addLog(session.id, {
      type: 'workflow_started',
      workflowId: workflowDef.id,
      runId: run.id
    });

    try {
      // Create git branch if needed
      if (options.createBranch !== false) {
        run.gitBranch = await this.createWorkflowBranch(run);
      }

      // Execute stages
      await this.executeWorkflow(run);

      // Create PR if configured
      if (workflowDef.options?.createPR && run.gitBranch) {
        await this.createWorkflowPR(run);
      }

      // Mark completed
      run.status = WorkflowStatus.COMPLETED;
      run.endTime = new Date();
      this.sessionManager.markCompleted(session.id, {
        runId: run.id,
        gitBranch: run.gitBranch
      });

      this.emit('workflow_completed', {
        runId: run.id,
        sessionId: session.id
      });

    } catch (error) {
      run.status = WorkflowStatus.FAILED;
      run.error = error.message;
      run.endTime = new Date();

      this.sessionManager.markFailed(session.id, error.message);

      this.emit('workflow_failed', {
        runId: run.id,
        sessionId: session.id,
        error: error.message
      });

      throw error;
    }

    return run;
  }

  /**
   * Execute all stages in a workflow
   * @param {Object} run - Workflow run
   */
  async executeWorkflow(run) {
    const { workflowDef } = run;

    for (let i = run.currentStageIndex; i < workflowDef.stages.length; i++) {
      // Check for cancellation
      if (run.status === WorkflowStatus.CANCELLED) {
        throw new Error('Workflow cancelled');
      }

      const stage = workflowDef.stages[i];
      run.currentStageIndex = i;

      this.emit('stage_started', {
        runId: run.id,
        stageIndex: i,
        stageName: stage.name
      });

      this.sessionManager.addLog(run.sessionId, {
        type: 'stage_started',
        stageIndex: i,
        stageName: stage.name
      });

      await this.executeStage(run, stage);

      // Checkpoint after stage completion
      this.sessionManager.checkpoint(run.sessionId, {
        stageIndex: i,
        stageName: stage.name,
        completedAgents: [...run.completedAgents],
        state: {
          currentStageIndex: i + 1,
          context: run.context
        }
      });

      this.emit('stage_completed', {
        runId: run.id,
        stageIndex: i,
        stageName: stage.name
      });
    }
  }

  /**
   * Execute a single stage
   * @param {Object} run - Workflow run
   * @param {Object} stage - Stage definition
   */
  async executeStage(run, stage) {
    const { agents, executionMode } = stage;

    // Filter out already completed agents
    const agentsToRun = agents.filter(a => !run.completedAgents.has(a));

    if (agentsToRun.length === 0) {
      return; // All agents already completed
    }

    if (executionMode === StageExecutionMode.PARALLEL) {
      // Run agents in parallel
      await Promise.all(
        agentsToRun.map(agentType => this.spawnAndExecuteAgent(run, agentType))
      );
    } else {
      // Run agents sequentially
      for (const agentType of agentsToRun) {
        await this.spawnAndExecuteAgent(run, agentType);
      }
    }
  }

  /**
   * Spawn and execute a single agent
   * @param {Object} run - Workflow run
   * @param {string} agentType - Agent type to execute
   * @returns {Object} - Agent execution result
   */
  async spawnAndExecuteAgent(run, agentType) {
    const agentConfig = getAgentConfig(agentType);
    const executionId = uuidv4();

    const execution = {
      id: executionId,
      agentType,
      taskId: null,
      status: AgentStatus.SPAWNING,
      startTime: new Date(),
      endTime: null,
      output: null,
      error: null,
      model: selectModelForAgent(agentType, run.context)
    };

    run.agentExecutions.push(execution);

    this.emit('agent_spawned', {
      runId: run.id,
      executionId,
      agentType
    });

    this.sessionManager.addLog(run.sessionId, {
      type: 'agent_spawned',
      agentType,
      executionId,
      model: execution.model
    });

    try {
      // Create PMS task
      const taskManager = await this.getTaskManager();
      const contextSerializer = await this.getContextSerializer();

      // Gather dependency outputs
      const dependencyOutputs = await this.gatherDependencyOutputs(run, agentType);

      // Create task with serialized context
      const taskContext = contextSerializer.serializeContext({
        agentType,
        workflowId: run.workflowId,
        context: run.context,
        dependencyOutputs
      });

      const task = await taskManager.createTask({
        agentType,
        summary: `Execute ${agentConfig.name}`,
        description: `Agent execution for ${agentConfig.name} in workflow ${run.workflowId}`,
        context: taskContext,
        dependencies: agentConfig.dependencies.map(dep => {
          const depExec = run.agentExecutions.find(e => e.agentType === dep && e.status === AgentStatus.COMPLETED);
          return depExec?.taskId;
        }).filter(Boolean)
      });

      execution.taskId = task.id;
      execution.status = AgentStatus.RUNNING;

      // Execute via Claude CLI
      const claudeCli = await this.getClaudeCli();
      const responseParser = await this.getResponseParser();

      const modelArg = getModelCliArgForAgent(agentType);
      const response = await claudeCli.executeAgent({
        agentType,
        taskId: task.id,
        context: taskContext,
        model: modelArg,
        timeout: agentConfig.timeoutMs
      });

      // Parse response
      const output = responseParser.parseAgentResponse(response);

      execution.status = AgentStatus.COMPLETED;
      execution.endTime = new Date();
      execution.output = output;

      // Update task
      await taskManager.completeTask(task.id, output);

      // Commit artifacts to git
      if (output.artifacts?.length > 0 && run.gitBranch) {
        await this.commitAgentArtifacts(run, agentType, output);
      }

      // Update run context with agent output
      run.context[`${agentType}_output`] = output;
      run.completedAgents.add(agentType);

      // Record execution in session
      this.sessionManager.recordAgentExecution(run.sessionId, {
        agentType,
        executionId,
        status: 'completed',
        tokensUsed: output.metadata?.tokensUsed,
        executionTime: execution.endTime - execution.startTime
      });

      this.emit('agent_completed', {
        runId: run.id,
        executionId,
        agentType,
        output
      });

      return execution;

    } catch (error) {
      execution.status = AgentStatus.FAILED;
      execution.endTime = new Date();
      execution.error = error.message;

      // Update task if created
      if (execution.taskId) {
        const taskManager = await this.getTaskManager();
        await taskManager.failTask(execution.taskId, error.message);
      }

      this.sessionManager.recordAgentExecution(run.sessionId, {
        agentType,
        executionId,
        status: 'failed',
        error: error.message,
        executionTime: execution.endTime - execution.startTime
      });

      this.emit('agent_failed', {
        runId: run.id,
        executionId,
        agentType,
        error: error.message
      });

      // Retry logic
      const retries = run.context[`${agentType}_retries`] || 0;
      if (retries < agentConfig.maxRetries) {
        run.context[`${agentType}_retries`] = retries + 1;
        this.sessionManager.addLog(run.sessionId, {
          type: 'agent_retry',
          agentType,
          attempt: retries + 1
        });
        return this.spawnAndExecuteAgent(run, agentType);
      }

      throw error;
    }
  }

  /**
   * Gather outputs from dependency agents
   * @param {Object} run - Workflow run
   * @param {string} agentType - Current agent type
   * @returns {Object} - Dependency outputs map
   */
  async gatherDependencyOutputs(run, agentType) {
    const agentConfig = getAgentConfig(agentType);
    const outputs = {};

    for (const depType of agentConfig.dependencies) {
      const depOutput = run.context[`${depType}_output`];
      if (depOutput) {
        outputs[depType] = depOutput;
      }
    }

    return outputs;
  }

  /**
   * Create git branch for workflow
   * @param {Object} run - Workflow run
   * @returns {string} - Branch name
   */
  async createWorkflowBranch(run) {
    const gitManager = await this.getGitManager();
    const projectName = run.context.projectName || 'app';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const branchName = `feature/${projectName}/${date}`;

    await gitManager.createBranch(branchName);
    return branchName;
  }

  /**
   * Commit agent artifacts to git
   * @param {Object} run - Workflow run
   * @param {string} agentType - Agent type
   * @param {Object} output - Agent output
   */
  async commitAgentArtifacts(run, agentType, output) {
    const gitManager = await this.getGitManager();

    const files = output.artifacts
      .filter(a => a.path && a.content)
      .map(a => ({ path: a.path, content: a.content }));

    if (files.length > 0) {
      const message = `[${agentType}] ${output.summary || 'Agent execution'}`;
      await gitManager.commitFiles(files, message);
    }
  }

  /**
   * Create PR for workflow
   * @param {Object} run - Workflow run
   */
  async createWorkflowPR(run) {
    try {
      const prManager = await this.getPRManager();
      const pr = await prManager.createPR(run.gitBranch, {
        title: `[${run.workflowId}] ${run.context.projectName || 'Generated App'}`,
        body: this.generatePRBody(run),
        draft: run.workflowDef.options?.draftPR ?? true
      });

      run.prUrl = pr.url;

      this.sessionManager.addLog(run.sessionId, {
        type: 'pr_created',
        prUrl: pr.url
      });

    } catch (error) {
      const failureMode = run.workflowDef.options?.prFailureMode || 'warn';

      if (failureMode === 'fail') {
        throw error;
      }

      // Log warning and continue
      this.sessionManager.addLog(run.sessionId, {
        type: 'pr_failed',
        error: error.message
      });
    }
  }

  /**
   * Generate PR body from workflow run
   * @param {Object} run - Workflow run
   * @returns {string}
   */
  generatePRBody(run) {
    const sections = [];

    sections.push(`## Workflow: ${run.workflowDef.name}`);
    sections.push(run.workflowDef.description);
    sections.push('');

    sections.push('## Agents Executed');
    for (const exec of run.agentExecutions) {
      const config = getAgentConfig(exec.agentType);
      const status = exec.status === AgentStatus.COMPLETED ? '✅' : '❌';
      sections.push(`- ${status} ${config.name} (${exec.agentType})`);
    }
    sections.push('');

    sections.push('## Summary');
    for (const exec of run.agentExecutions.filter(e => e.output?.summary)) {
      const config = getAgentConfig(exec.agentType);
      sections.push(`### ${config.name}`);
      sections.push(exec.output.summary);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Cancel a running workflow
   * @param {string} runId - Run ID to cancel
   * @param {Object} [options] - Cancel options
   */
  async cancelWorkflow(runId, options = {}) {
    const run = this.activeRuns.get(runId);
    if (!run) {
      throw new Error(`Workflow run not found: ${runId}`);
    }

    run.status = WorkflowStatus.CANCELLED;
    run.endTime = new Date();

    // Mark running agents as failed
    for (const exec of run.agentExecutions) {
      if (exec.status === AgentStatus.RUNNING || exec.status === AgentStatus.SPAWNING) {
        exec.status = AgentStatus.FAILED;
        exec.error = 'Workflow cancelled';
        exec.endTime = new Date();
      }
    }

    this.sessionManager.markFailed(run.sessionId, 'Workflow cancelled');

    if (options.cleanup) {
      // Clean up git branch if requested
      if (run.gitBranch) {
        try {
          const gitManager = await this.getGitManager();
          await gitManager.deleteBranch(run.gitBranch);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }

    this.activeRuns.delete(runId);

    this.emit('workflow_cancelled', {
      runId,
      sessionId: run.sessionId
    });
  }

  /**
   * Resume a workflow from checkpoint
   * @param {string} sessionId - Session ID to resume
   * @returns {Object} - Resumed workflow run
   */
  async resumeWorkflow(sessionId) {
    const restored = this.sessionManager.restore(sessionId);
    if (!restored) {
      throw new Error(`Cannot restore session: ${sessionId}`);
    }

    const { session, checkpoint } = restored;
    const workflowDef = getWorkflow(session.workflowId);

    if (!workflowDef) {
      throw new Error(`Unknown workflow: ${session.workflowId}`);
    }

    // Create new run from checkpoint
    const run = {
      id: uuidv4(),
      workflowId: session.workflowId,
      workflowDef,
      sessionId: session.id,
      status: WorkflowStatus.RUNNING,
      context: { ...session.context },
      currentStageIndex: checkpoint?.stageIndex + 1 || session.currentStage,
      agentExecutions: session.metadata.agentExecutions || [],
      completedAgents: new Set(session.completedAgents || []),
      startTime: new Date(),
      endTime: null,
      gitBranch: session.context.gitBranch || null,
      error: null,
      options: session.options
    };

    this.activeRuns.set(run.id, run);

    this.emit('workflow_resumed', {
      runId: run.id,
      sessionId,
      fromStage: run.currentStageIndex
    });

    try {
      await this.executeWorkflow(run);

      if (workflowDef.options?.createPR && run.gitBranch) {
        await this.createWorkflowPR(run);
      }

      run.status = WorkflowStatus.COMPLETED;
      run.endTime = new Date();
      this.sessionManager.markCompleted(sessionId, { runId: run.id });

      this.emit('workflow_completed', { runId: run.id, sessionId });

    } catch (error) {
      run.status = WorkflowStatus.FAILED;
      run.error = error.message;
      run.endTime = new Date();

      this.sessionManager.markFailed(sessionId, error.message);
      this.emit('workflow_failed', { runId: run.id, sessionId, error: error.message });

      throw error;
    }

    return run;
  }

  /**
   * Get active workflow run
   * @param {string} runId
   * @returns {Object|undefined}
   */
  getRun(runId) {
    return this.activeRuns.get(runId);
  }

  /**
   * Get all active runs
   * @returns {Object[]}
   */
  getActiveRuns() {
    return [...this.activeRuns.values()];
  }

  /**
   * Check if a session has an active run (for zombie detection)
   * @param {string} sessionId
   * @returns {boolean}
   */
  hasActiveRun(sessionId) {
    for (const run of this.activeRuns.values()) {
      if (run.sessionId === sessionId) {
        return true;
      }
    }
    return false;
  }
}

// Singleton instance
let instance = null;

/**
 * Get WorkflowEngine singleton instance
 * @returns {WorkflowEngine}
 */
export function getWorkflowEngine() {
  if (!instance) {
    instance = new WorkflowEngine();
  }
  return instance;
}

export default {
  getWorkflowEngine
};
