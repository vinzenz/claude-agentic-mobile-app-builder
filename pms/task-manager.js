/**
 * Task Manager - File-based task store
 * Manages task lifecycle, dependencies, and persistence
 */

import fs from 'fs';
import path from 'path';
import { TaskStatus, TaskPriority, generateTaskId, parseTaskId, isValidStatusTransition } from './types.js';

const TASKS_DIR = '.tasks';

/**
 * TaskManager singleton class
 * File-based task storage in .tasks/ directory
 */
class TaskManager {
  constructor() {
    this.tasksDir = TASKS_DIR;
    this.tasks = new Map();
    this.sequence = 0;
    this.ensureTasksDir();
    this.loadTasks();
  }

  /**
   * Ensure tasks directory exists
   */
  ensureTasksDir() {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
    }
  }

  /**
   * Load existing tasks from disk
   */
  loadTasks() {
    const files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(this.tasksDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.tasks.set(data.id, data);

        const seq = parseTaskId(data.id);
        if (seq > this.sequence) {
          this.sequence = seq;
        }
      } catch (error) {
        console.error(`Error loading task ${file}:`, error.message);
      }
    }
  }

  /**
   * Create a new task
   * @param {Object} params - Task parameters
   * @returns {Object} - Created task
   */
  async createTask(params) {
    this.sequence++;
    const taskId = generateTaskId(this.sequence);
    const now = new Date().toISOString();

    const task = {
      id: taskId,
      agentType: params.agentType,
      summary: params.summary || '',
      description: params.description || '',
      status: TaskStatus.PENDING,
      priority: params.priority || TaskPriority.MEDIUM,
      deps: params.dependencies || [],
      blocked_by: [],
      blocking: [],
      context: params.context || '',
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      metadata: params.metadata || {}
    };

    // Calculate blocking relationships
    await this.updateBlockingRelationships(task);

    this.tasks.set(taskId, task);
    this.saveTask(task);

    return task;
  }

  /**
   * Get task by ID
   * @param {string} taskId
   * @returns {Object|null}
   */
  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Update task status
   * @param {string} taskId
   * @param {string} newStatus
   * @param {Object} [updates] - Additional updates
   */
  async updateStatus(taskId, newStatus, updates = {}) {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!isValidStatusTransition(task.status, newStatus)) {
      throw new Error(`Invalid status transition: ${task.status} → ${newStatus}`);
    }

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    if (newStatus === TaskStatus.COMPLETED) {
      task.completedAt = task.updatedAt;
    }

    Object.assign(task, updates);
    this.saveTask(task);

    // Update dependent tasks when this one completes
    if (newStatus === TaskStatus.COMPLETED) {
      await this.unblockDependentTasks(taskId);
    }

    return task;
  }

  /**
   * Start task execution
   * @param {string} taskId
   */
  async startTask(taskId) {
    return this.updateStatus(taskId, TaskStatus.IN_PROGRESS);
  }

  /**
   * Complete task with output
   * @param {string} taskId
   * @param {Object} output
   */
  async completeTask(taskId, output) {
    return this.updateStatus(taskId, TaskStatus.COMPLETED, { output });
  }

  /**
   * Fail task with error
   * @param {string} taskId
   * @param {string} error
   */
  async failTask(taskId, error) {
    return this.updateStatus(taskId, TaskStatus.FAILED, { error });
  }

  /**
   * Block task
   * @param {string} taskId
   * @param {string} blockedBy - Task ID blocking this one
   */
  async blockTask(taskId, blockedBy) {
    const task = this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.blocked_by.includes(blockedBy)) {
      task.blocked_by.push(blockedBy);
    }

    return this.updateStatus(taskId, TaskStatus.BLOCKED);
  }

  /**
   * Update blocking relationships for a task
   * @param {Object} task
   */
  async updateBlockingRelationships(task) {
    // Check which dependencies are not completed
    for (const depId of task.deps) {
      const depTask = this.getTask(depId);
      if (depTask && depTask.status !== TaskStatus.COMPLETED) {
        task.blocked_by.push(depId);

        // Update the blocking task
        if (!depTask.blocking.includes(task.id)) {
          depTask.blocking.push(task.id);
          this.saveTask(depTask);
        }
      }
    }

    // Set status to blocked if has unmet dependencies
    if (task.blocked_by.length > 0) {
      task.status = TaskStatus.BLOCKED;
    }
  }

  /**
   * Unblock tasks that depend on completed task
   * @param {string} completedTaskId
   */
  async unblockDependentTasks(completedTaskId) {
    const completedTask = this.getTask(completedTaskId);
    if (!completedTask) return;

    for (const blockingId of completedTask.blocking) {
      const task = this.getTask(blockingId);
      if (!task) continue;

      // Remove from blocked_by
      task.blocked_by = task.blocked_by.filter(id => id !== completedTaskId);
      task.updatedAt = new Date().toISOString();

      // If no longer blocked, set to pending
      if (task.blocked_by.length === 0 && task.status === TaskStatus.BLOCKED) {
        task.status = TaskStatus.PENDING;
      }

      this.saveTask(task);
    }

    // Clear blocking list
    completedTask.blocking = [];
    this.saveTask(completedTask);
  }

  /**
   * List tasks with filters
   * @param {Object} [filters]
   * @returns {Object[]}
   */
  listTasks(filters = {}) {
    let tasks = [...this.tasks.values()];

    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }

    if (filters.agentType) {
      tasks = tasks.filter(t => t.agentType === filters.agentType);
    }

    if (filters.priority) {
      tasks = tasks.filter(t => t.priority === filters.priority);
    }

    // Sort by creation date descending
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return tasks;
  }

  /**
   * Get tasks ready for execution (no blockers)
   * @returns {Object[]}
   */
  getReadyTasks() {
    return [...this.tasks.values()].filter(
      t => t.status === TaskStatus.PENDING && t.blocked_by.length === 0
    );
  }

  /**
   * Get task context for agent execution
   * @param {string} taskId
   * @returns {string}
   */
  getTaskContext(taskId) {
    const task = this.getTask(taskId);
    return task?.context || '';
  }

  /**
   * Get task output
   * @param {string} taskId
   * @returns {Object|null}
   */
  getTaskOutput(taskId) {
    const task = this.getTask(taskId);
    return task?.output || null;
  }

  /**
   * Delete task
   * @param {string} taskId
   */
  deleteTask(taskId) {
    const filePath = path.join(this.tasksDir, `${taskId}.json`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.tasks.delete(taskId);
  }

  /**
   * Save task to file
   * @param {Object} task
   */
  saveTask(task) {
    const filePath = path.join(this.tasksDir, `${task.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
  }

  /**
   * Get task statistics
   * @returns {Object}
   */
  getStatistics() {
    const tasks = [...this.tasks.values()];

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      inProgress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      blocked: tasks.filter(t => t.status === TaskStatus.BLOCKED).length,
      failed: tasks.filter(t => t.status === TaskStatus.FAILED).length
    };
  }

  /**
   * Clean up old completed tasks
   * @param {number} maxAgeDays
   */
  cleanup(maxAgeDays = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    let deleted = 0;
    for (const task of this.tasks.values()) {
      if (task.status === TaskStatus.COMPLETED && task.completedAt) {
        const completedAt = new Date(task.completedAt);
        if (completedAt < cutoff) {
          this.deleteTask(task.id);
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Get dependency graph for visualization
   * @returns {Object}
   */
  getDependencyGraph() {
    const nodes = [];
    const edges = [];

    for (const task of this.tasks.values()) {
      nodes.push({
        id: task.id,
        label: `${task.id}\n${task.agentType}`,
        status: task.status
      });

      for (const depId of task.deps) {
        edges.push({
          from: depId,
          to: task.id
        });
      }
    }

    return { nodes, edges };
  }
}

// Singleton instance
let instance = null;

/**
 * Get TaskManager singleton instance
 * @returns {TaskManager}
 */
export function getTaskManager() {
  if (!instance) {
    instance = new TaskManager();
  }
  return instance;
}

export default {
  getTaskManager,
  TaskStatus,
  TaskPriority
};
