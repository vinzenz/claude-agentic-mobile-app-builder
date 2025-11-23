/**
 * Session Manager - File-based session persistence with checkpointing
 * Singleton, extends EventEmitter for state change notifications
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowStatus } from './types.js';

const SESSIONS_DIR = '.sessions';

/**
 * Session status lifecycle:
 * - running → paused|failed|completed
 * - failed → resumable (if checkpoints exist)
 */
const SessionStatus = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
});

/**
 * SessionManager singleton class
 * Manages session persistence and recovery
 */
class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.sessionsDir = SESSIONS_DIR;
    this.ensureSessionsDir();
  }

  /**
   * Ensure sessions directory exists
   */
  ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Create a new session
   * @param {Object} params - Session parameters
   * @param {string} params.workflowId - Workflow being executed
   * @param {Object} params.context - Initial context
   * @param {Object} [params.options] - Session options
   * @returns {Object} - Created session
   */
  createSession({ workflowId, context, options = {} }) {
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    const session = {
      id: sessionId,
      status: SessionStatus.RUNNING,
      workflowId,
      context: context || {},
      options,
      checkpoints: [],
      logs: [],
      createdAt: now,
      updatedAt: now,
      completedAgents: [],
      currentStage: 0,
      metadata: {
        totalTokens: 0,
        totalExecutionTime: 0,
        agentExecutions: []
      }
    };

    this.sessions.set(sessionId, session);
    this.saveSession(session);

    this.emit('session_created', { sessionId, workflowId });

    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    // Try memory first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    // Try loading from file
    return this.loadSession(sessionId);
  }

  /**
   * Update session status
   * @param {string} sessionId
   * @param {string} status
   * @param {Object} [updates] - Additional updates
   */
  updateStatus(sessionId, status, updates = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const oldStatus = session.status;
    session.status = status;
    session.updatedAt = new Date().toISOString();

    Object.assign(session, updates);

    this.sessions.set(sessionId, session);
    this.saveSession(session);

    this.emit('session_status_changed', {
      sessionId,
      oldStatus,
      newStatus: status
    });
  }

  /**
   * Create a checkpoint at stage completion
   * @param {string} sessionId
   * @param {Object} data - Checkpoint data
   */
  checkpoint(sessionId, data) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const checkpoint = {
      id: uuidv4(),
      sessionId,
      stageIndex: data.stageIndex,
      stageName: data.stageName,
      completedAgents: [...(data.completedAgents || [])],
      state: data.state || {},
      timestamp: new Date().toISOString()
    };

    session.checkpoints.push(checkpoint);
    session.currentStage = data.stageIndex + 1;
    session.completedAgents = checkpoint.completedAgents;
    session.updatedAt = checkpoint.timestamp;

    this.sessions.set(sessionId, session);
    this.saveSession(session);

    this.emit('checkpoint_created', {
      sessionId,
      checkpointId: checkpoint.id,
      stageIndex: checkpoint.stageIndex
    });

    return checkpoint;
  }

  /**
   * Restore session from checkpoint for resumption
   * @param {string} sessionId
   * @returns {Object|null} - Session with latest checkpoint
   */
  restore(sessionId) {
    const session = this.loadSession(sessionId);
    if (!session) {
      return null;
    }

    // Check if resumable
    if (session.status === SessionStatus.COMPLETED) {
      throw new Error('Cannot resume completed session');
    }

    if (session.checkpoints.length === 0 && session.status === SessionStatus.FAILED) {
      throw new Error('No checkpoints available for resumption');
    }

    // Get latest checkpoint
    const latestCheckpoint = session.checkpoints.length > 0
      ? session.checkpoints[session.checkpoints.length - 1]
      : null;

    // Update status to running
    session.status = SessionStatus.RUNNING;
    session.updatedAt = new Date().toISOString();

    this.sessions.set(sessionId, session);
    this.saveSession(session);

    this.emit('session_restored', {
      sessionId,
      checkpoint: latestCheckpoint
    });

    return {
      session,
      checkpoint: latestCheckpoint
    };
  }

  /**
   * Add log entry to session
   * @param {string} sessionId
   * @param {Object} logEntry
   */
  addLog(sessionId, logEntry) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.logs.push({
      ...logEntry,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 log entries
    if (session.logs.length > 1000) {
      session.logs = session.logs.slice(-1000);
    }

    this.sessions.set(sessionId, session);
    this.saveSession(session);
  }

  /**
   * Record agent execution
   * @param {string} sessionId
   * @param {Object} execution
   */
  recordAgentExecution(sessionId, execution) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.metadata.agentExecutions.push(execution);

    if (execution.tokensUsed) {
      session.metadata.totalTokens += execution.tokensUsed;
    }
    if (execution.executionTime) {
      session.metadata.totalExecutionTime += execution.executionTime;
    }
    if (execution.status === 'completed') {
      session.completedAgents.push(execution.agentType);
    }

    session.updatedAt = new Date().toISOString();
    this.sessions.set(sessionId, session);
    this.saveSession(session);
  }

  /**
   * Mark session as failed
   * @param {string} sessionId
   * @param {string} error
   */
  markFailed(sessionId, error) {
    this.updateStatus(sessionId, SessionStatus.FAILED, { error });
    this.emit('session_failed', { sessionId, error });
  }

  /**
   * Mark session as completed
   * @param {string} sessionId
   * @param {Object} [result]
   */
  markCompleted(sessionId, result) {
    this.updateStatus(sessionId, SessionStatus.COMPLETED, { result });
    this.emit('session_completed', { sessionId, result });
  }

  /**
   * Mark session as paused
   * @param {string} sessionId
   */
  markPaused(sessionId) {
    this.updateStatus(sessionId, SessionStatus.PAUSED);
    this.emit('session_paused', { sessionId });
  }

  /**
   * Save session to file
   * @param {Object} session
   */
  saveSession(session) {
    const filePath = path.join(this.sessionsDir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  /**
   * Load session from file
   * @param {string} sessionId
   * @returns {Object|null}
   */
  loadSession(sessionId) {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const session = JSON.parse(data);
      this.sessions.set(sessionId, session);
      return session;
    } catch (error) {
      console.error(`Error loading session ${sessionId}:`, error.message);
      return null;
    }
  }

  /**
   * List all sessions
   * @param {Object} [filters] - Filter options
   * @returns {Object[]}
   */
  listSessions(filters = {}) {
    this.ensureSessionsDir();

    const files = fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.json'));

    const sessions = [];
    for (const file of files) {
      const sessionId = file.replace('.json', '');
      const session = this.loadSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    // Apply filters
    let filtered = sessions;

    if (filters.status) {
      filtered = filtered.filter(s => s.status === filters.status);
    }

    if (filters.workflowId) {
      filtered = filtered.filter(s => s.workflowId === filters.workflowId);
    }

    // Sort by creation date descending
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return filtered;
  }

  /**
   * Delete session
   * @param {string} sessionId
   */
  deleteSession(sessionId) {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.sessions.delete(sessionId);
    this.emit('session_deleted', { sessionId });
  }

  /**
   * Get session logs
   * @param {string} sessionId
   * @returns {Object[]}
   */
  getLogs(sessionId) {
    const session = this.getSession(sessionId);
    return session?.logs || [];
  }

  /**
   * Get session statistics
   * @param {string} sessionId
   * @returns {Object}
   */
  getStatistics(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      sessionId,
      workflowId: session.workflowId,
      status: session.status,
      totalTokens: session.metadata.totalTokens,
      totalExecutionTime: session.metadata.totalExecutionTime,
      completedAgents: session.completedAgents.length,
      checkpoints: session.checkpoints.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  /**
   * Check if session is resumable
   * @param {string} sessionId
   * @returns {boolean}
   */
  isResumable(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return false;

    return (
      session.status === SessionStatus.FAILED ||
      session.status === SessionStatus.PAUSED
    ) && (
      session.checkpoints.length > 0 ||
      session.completedAgents.length > 0
    );
  }

  /**
   * Clean up old sessions
   * @param {number} maxAgeDays - Maximum age in days
   */
  cleanup(maxAgeDays = 30) {
    const sessions = this.listSessions();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    let deleted = 0;
    for (const session of sessions) {
      const updatedAt = new Date(session.updatedAt);
      if (updatedAt < cutoff && session.status !== SessionStatus.RUNNING) {
        this.deleteSession(session.id);
        deleted++;
      }
    }

    return deleted;
  }
}

// Singleton instance
let instance = null;

/**
 * Get SessionManager singleton instance
 * @returns {SessionManager}
 */
export function getSessionManager() {
  if (!instance) {
    instance = new SessionManager();
  }
  return instance;
}

export { SessionStatus };

export default {
  getSessionManager,
  SessionStatus
};
