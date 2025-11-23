/**
 * PMS (Project Management System) Types
 * Defines task structures and status enums
 */

/**
 * Task status lifecycle:
 * pending → in_progress → completed|blocked|failed
 */
export const TaskStatus = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  FAILED: 'failed'
});

/**
 * Task priority levels
 */
export const TaskPriority = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

/**
 * Artifact types
 */
export const ArtifactType = Object.freeze({
  FILE: 'file',
  CODE: 'code',
  CONFIG: 'config',
  DOCUMENTATION: 'documentation',
  TEST: 'test',
  DESIGN: 'design',
  SCHEMA: 'schema'
});

/**
 * @typedef {Object} Task
 * @property {string} id - Task ID (TASK-0001 format)
 * @property {string} agentType - Agent responsible for this task
 * @property {string} summary - Brief task summary
 * @property {string} description - Detailed description
 * @property {string} status - Current status
 * @property {string} priority - Task priority
 * @property {string[]} deps - Task IDs this task depends on
 * @property {string[]} blocked_by - Tasks blocking this one
 * @property {string[]} blocking - Tasks this one is blocking
 * @property {string} context - Serialized context (XML)
 * @property {Object} [output] - Task output when completed
 * @property {string} [error] - Error message if failed
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {Date} [completedAt] - Completion timestamp
 */

/**
 * @typedef {Object} Artifact
 * @property {string} name - Artifact name
 * @property {string} type - Artifact type
 * @property {string} [path] - File path if applicable
 * @property {string} content - Artifact content
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} TaskOutput
 * @property {boolean} success - Whether task succeeded
 * @property {string} summary - Output summary
 * @property {Artifact[]} artifacts - Generated artifacts
 * @property {Object} metadata - Execution metadata
 * @property {string[]} [nextSteps] - Suggested next steps
 * @property {string[]} [warnings] - Any warnings
 */

/**
 * Generate next task ID
 * @param {number} sequence - Current sequence number
 * @returns {string}
 */
export function generateTaskId(sequence) {
  return `TASK-${String(sequence).padStart(4, '0')}`;
}

/**
 * Parse task ID to get sequence number
 * @param {string} taskId
 * @returns {number}
 */
export function parseTaskId(taskId) {
  const match = taskId.match(/TASK-(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Validate task status transition
 * @param {string} currentStatus
 * @param {string} newStatus
 * @returns {boolean}
 */
export function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.BLOCKED],
    [TaskStatus.BLOCKED]: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
    [TaskStatus.COMPLETED]: [], // Terminal state
    [TaskStatus.FAILED]: [TaskStatus.PENDING] // Can retry
  };

  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
}

export default {
  TaskStatus,
  TaskPriority,
  ArtifactType,
  generateTaskId,
  parseTaskId,
  isValidStatusTransition
};
