/**
 * Core types and enums for the orchestration framework
 */

/**
 * Agent types - 12 specialized AI agents
 * @readonly
 * @enum {string}
 */
export const AgentType = Object.freeze({
  PM: 'PM',                     // Project Manager - high-level planning
  ARCHITECT: 'ARCHITECT',       // System Architect - technical design
  UIUX: 'UIUX',                 // UI/UX Designer - interface design
  TL_FRONTEND: 'TL_FRONTEND',   // Tech Lead Frontend - frontend architecture
  TL_BACKEND: 'TL_BACKEND',     // Tech Lead Backend - backend architecture
  DEV_FRONTEND: 'DEV_FRONTEND', // Frontend Developer - UI implementation
  DEV_BACKEND: 'DEV_BACKEND',   // Backend Developer - API/services implementation
  TEST: 'TEST',                 // Test Engineer - testing strategy & implementation
  CQR: 'CQR',                   // Code Quality Reviewer - code review
  SR: 'SR',                     // Security Reviewer - security analysis
  DOE: 'DOE'                    // DevOps Engineer - deployment & infrastructure
});

/**
 * Agent execution status
 * @readonly
 * @enum {string}
 */
export const AgentStatus = Object.freeze({
  IDLE: 'idle',
  SPAWNING: 'spawning',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
});

/**
 * Workflow execution status
 * @readonly
 * @enum {string}
 */
export const WorkflowStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

/**
 * Claude model tiers for cost optimization
 * @readonly
 * @enum {string}
 */
export const ModelTier = Object.freeze({
  OPUS: 'opus',       // Deep reasoning - PM, ARCHITECT, SR
  SONNET: 'sonnet',   // Balanced - most agents
  HAIKU: 'haiku'      // Simple procedural - DOE
});

/**
 * Stage execution modes
 * @readonly
 * @enum {string}
 */
export const StageExecutionMode = Object.freeze({
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel'
});

/**
 * PR failure modes
 * @readonly
 * @enum {string}
 */
export const PRFailureMode = Object.freeze({
  FAIL: 'fail',   // Throw error on PR failure
  WARN: 'warn'    // Log warning and continue
});

/**
 * @typedef {Object} Artifact
 * @property {string} name - Artifact name
 * @property {string} type - Artifact type (file, code, config, etc.)
 * @property {string} path - File path (if applicable)
 * @property {string} content - Artifact content
 */

/**
 * @typedef {Object} AgentOutput
 * @property {boolean} success - Whether execution succeeded
 * @property {string} summary - Summary of what was done
 * @property {Artifact[]} artifacts - Generated artifacts
 * @property {Object} metadata - Execution metadata
 * @property {number} metadata.tokensUsed - Tokens consumed
 * @property {number} metadata.executionTime - Execution time in ms
 * @property {string[]} metadata.filesCreated - List of created files
 * @property {string[]} metadata.filesModified - List of modified files
 * @property {string[]} [nextSteps] - Suggested next steps
 * @property {string[]} [warnings] - Any warnings encountered
 */

/**
 * @typedef {Object} AgentExecution
 * @property {string} id - Unique execution ID
 * @property {string} agentType - Type of agent
 * @property {string} taskId - Associated PMS task ID
 * @property {string} status - Current status
 * @property {Date} startTime - When execution started
 * @property {Date} [endTime] - When execution ended
 * @property {AgentOutput} [output] - Agent output (when completed)
 * @property {string} [error] - Error message (when failed)
 */

/**
 * @typedef {Object} StageDefinition
 * @property {string} name - Stage name
 * @property {string} description - Stage description
 * @property {string[]} agents - Agent types in this stage
 * @property {string} executionMode - 'sequential' or 'parallel'
 * @property {string[]} [dependencies] - Stage dependencies
 */

/**
 * @typedef {Object} WorkflowDefinition
 * @property {string} id - Workflow ID
 * @property {string} name - Workflow name
 * @property {string} description - Workflow description
 * @property {StageDefinition[]} stages - Ordered list of stages
 * @property {Object} [options] - Workflow options
 */

/**
 * @typedef {Object} WorkflowRun
 * @property {string} id - Run ID
 * @property {string} workflowId - Associated workflow ID
 * @property {string} sessionId - Session ID
 * @property {string} status - Current status
 * @property {Object} context - Runtime context
 * @property {number} currentStageIndex - Current stage index
 * @property {AgentExecution[]} agentExecutions - All agent executions
 * @property {Date} startTime - When run started
 * @property {Date} [endTime] - When run ended
 * @property {string} [gitBranch] - Associated git branch
 * @property {string} [error] - Error message (if failed)
 */

/**
 * @typedef {Object} SessionCheckpoint
 * @property {string} sessionId - Session ID
 * @property {string} workflowRunId - Workflow run ID
 * @property {number} stageIndex - Completed stage index
 * @property {Date} timestamp - Checkpoint timestamp
 * @property {Object} state - Serialized state
 */

/**
 * @typedef {Object} Session
 * @property {string} id - Session ID
 * @property {string} status - Session status
 * @property {string} workflowId - Workflow being executed
 * @property {Object} context - Session context
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {SessionCheckpoint[]} checkpoints - Saved checkpoints
 */

export default {
  AgentType,
  AgentStatus,
  WorkflowStatus,
  ModelTier,
  StageExecutionMode,
  PRFailureMode
};
