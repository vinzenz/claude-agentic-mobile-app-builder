/**
 * Predefined workflow templates for common mobile app development scenarios
 * 7 workflow templates covering various development activities
 */

import { AgentType, StageExecutionMode, PRFailureMode } from './types.js';

/**
 * @typedef {Object} WorkflowTemplate
 * @property {string} id - Unique workflow identifier
 * @property {string} name - Human-readable name
 * @property {string} description - Workflow description
 * @property {string} category - Workflow category
 * @property {Array} stages - Ordered stages
 * @property {Object} options - Workflow options
 */

/**
 * Full App Generation Workflow
 * Complete mobile app development from requirements to deployment
 * 6 stages covering all 11 agents
 */
export const FULL_APP_GENERATION = Object.freeze({
  id: 'FULL_APP_GENERATION',
  name: 'Full App Generation',
  description: 'Complete mobile application development from requirements to deployment',
  category: 'creation',
  stages: [
    {
      name: 'Planning',
      description: 'Project planning and requirements analysis',
      agents: [AgentType.PM],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: []
    },
    {
      name: 'Architecture & Design',
      description: 'System architecture and UI/UX design',
      agents: [AgentType.ARCHITECT, AgentType.UIUX],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Planning']
    },
    {
      name: 'Technical Leadership',
      description: 'Frontend and backend technical planning',
      agents: [AgentType.TL_FRONTEND, AgentType.TL_BACKEND],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Architecture & Design']
    },
    {
      name: 'Development',
      description: 'Frontend and backend implementation',
      agents: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Technical Leadership']
    },
    {
      name: 'Quality & Security',
      description: 'Testing, code review, and security analysis',
      agents: [AgentType.TEST, AgentType.CQR, AgentType.SR],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Development']
    },
    {
      name: 'Deployment',
      description: 'CI/CD and deployment configuration',
      agents: [AgentType.DOE],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: ['Quality & Security']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.FAIL,
    createPR: true,
    draftPR: true
  }
});

/**
 * Feature Addition Workflow
 * Add new feature to existing application
 */
export const FEATURE_ADDITION = Object.freeze({
  id: 'FEATURE_ADDITION',
  name: 'Feature Addition',
  description: 'Add a new feature to an existing mobile application',
  category: 'enhancement',
  stages: [
    {
      name: 'Feature Planning',
      description: 'Feature requirements and impact analysis',
      agents: [AgentType.PM],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: []
    },
    {
      name: 'Technical Design',
      description: 'Feature architecture and UI design',
      agents: [AgentType.ARCHITECT, AgentType.UIUX],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Feature Planning']
    },
    {
      name: 'Implementation',
      description: 'Feature development',
      agents: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Technical Design']
    },
    {
      name: 'Validation',
      description: 'Testing and code review',
      agents: [AgentType.TEST, AgentType.CQR],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Implementation']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.FAIL,
    createPR: true,
    draftPR: true
  }
});

/**
 * Bug Fix Workflow
 * Fix bugs in existing application
 */
export const BUG_FIX = Object.freeze({
  id: 'BUG_FIX',
  name: 'Bug Fix',
  description: 'Identify and fix bugs in the application',
  category: 'maintenance',
  stages: [
    {
      name: 'Investigation',
      description: 'Bug analysis and root cause identification',
      agents: [AgentType.PM],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: []
    },
    {
      name: 'Fix Implementation',
      description: 'Bug fix development',
      agents: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Investigation']
    },
    {
      name: 'Verification',
      description: 'Fix verification and regression testing',
      agents: [AgentType.TEST],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: ['Fix Implementation']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.FAIL,
    createPR: true,
    draftPR: false
  }
});

/**
 * Refactoring Workflow
 * Code refactoring and technical debt reduction
 */
export const REFACTORING = Object.freeze({
  id: 'REFACTORING',
  name: 'Refactoring',
  description: 'Code refactoring and technical debt reduction',
  category: 'maintenance',
  stages: [
    {
      name: 'Analysis',
      description: 'Code quality analysis and refactoring plan',
      agents: [AgentType.ARCHITECT, AgentType.CQR],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: []
    },
    {
      name: 'Refactoring',
      description: 'Code refactoring implementation',
      agents: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Analysis']
    },
    {
      name: 'Validation',
      description: 'Regression testing and review',
      agents: [AgentType.TEST, AgentType.CQR],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Refactoring']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.WARN,
    createPR: true,
    draftPR: true
  }
});

/**
 * Test Generation Workflow
 * Generate comprehensive test suites
 */
export const TEST_GENERATION = Object.freeze({
  id: 'TEST_GENERATION',
  name: 'Test Generation',
  description: 'Generate comprehensive test suites for existing code',
  category: 'quality',
  stages: [
    {
      name: 'Test Planning',
      description: 'Test strategy and coverage analysis',
      agents: [AgentType.TEST],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: []
    },
    {
      name: 'Test Implementation',
      description: 'Test case implementation',
      agents: [AgentType.TEST],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: ['Test Planning']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.WARN,
    createPR: true,
    draftPR: true
  }
});

/**
 * Code Review Workflow
 * Comprehensive code quality review
 */
export const CODE_REVIEW = Object.freeze({
  id: 'CODE_REVIEW',
  name: 'Code Review',
  description: 'Comprehensive code quality and best practices review',
  category: 'quality',
  stages: [
    {
      name: 'Quality Review',
      description: 'Code quality and maintainability review',
      agents: [AgentType.CQR],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: []
    },
    {
      name: 'Architecture Review',
      description: 'Architecture and design pattern review',
      agents: [AgentType.ARCHITECT],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: ['Quality Review']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.WARN,
    createPR: false,
    draftPR: false
  }
});

/**
 * Security Audit Workflow
 * Comprehensive security analysis
 */
export const SECURITY_AUDIT = Object.freeze({
  id: 'SECURITY_AUDIT',
  name: 'Security Audit',
  description: 'Comprehensive security vulnerability assessment',
  category: 'security',
  stages: [
    {
      name: 'Security Analysis',
      description: 'Security vulnerability scanning and analysis',
      agents: [AgentType.SR],
      executionMode: StageExecutionMode.SEQUENTIAL,
      dependencies: []
    },
    {
      name: 'Architecture Security Review',
      description: 'Security architecture and threat modeling',
      agents: [AgentType.ARCHITECT, AgentType.SR],
      executionMode: StageExecutionMode.PARALLEL,
      dependencies: ['Security Analysis']
    }
  ],
  options: {
    prFailureMode: PRFailureMode.FAIL,
    createPR: false,
    draftPR: false
  }
});

/**
 * All predefined workflows
 */
export const PREDEFINED_WORKFLOWS = Object.freeze({
  FULL_APP_GENERATION,
  FEATURE_ADDITION,
  BUG_FIX,
  REFACTORING,
  TEST_GENERATION,
  CODE_REVIEW,
  SECURITY_AUDIT
});

/**
 * Get workflow by ID
 * @param {string} workflowId
 * @returns {WorkflowTemplate|undefined}
 */
export function getWorkflow(workflowId) {
  return PREDEFINED_WORKFLOWS[workflowId];
}

/**
 * Get all workflow IDs
 * @returns {string[]}
 */
export function getWorkflowIds() {
  return Object.keys(PREDEFINED_WORKFLOWS);
}

/**
 * Get workflows by category
 * @param {string} category
 * @returns {WorkflowTemplate[]}
 */
export function getWorkflowsByCategory(category) {
  return Object.values(PREDEFINED_WORKFLOWS).filter(w => w.category === category);
}

/**
 * Get all workflow categories
 * @returns {string[]}
 */
export function getWorkflowCategories() {
  const categories = new Set(Object.values(PREDEFINED_WORKFLOWS).map(w => w.category));
  return [...categories];
}

/**
 * Get agents required for a workflow
 * @param {string} workflowId
 * @returns {string[]}
 */
export function getWorkflowAgents(workflowId) {
  const workflow = getWorkflow(workflowId);
  if (!workflow) return [];

  const agents = new Set();
  for (const stage of workflow.stages) {
    for (const agent of stage.agents) {
      agents.add(agent);
    }
  }
  return [...agents];
}

/**
 * Create a custom workflow from template
 * @param {string} baseWorkflowId - Base workflow to customize
 * @param {Object} customizations - Customization options
 * @returns {WorkflowTemplate}
 */
export function createCustomWorkflow(baseWorkflowId, customizations = {}) {
  const base = getWorkflow(baseWorkflowId);
  if (!base) {
    throw new Error(`Unknown workflow: ${baseWorkflowId}`);
  }

  return {
    ...base,
    id: customizations.id || `${base.id}_CUSTOM`,
    name: customizations.name || `${base.name} (Custom)`,
    stages: customizations.stages || base.stages,
    options: {
      ...base.options,
      ...customizations.options
    }
  };
}

export default {
  PREDEFINED_WORKFLOWS,
  getWorkflow,
  getWorkflowIds,
  getWorkflowsByCategory,
  getWorkflowCategories,
  getWorkflowAgents,
  createCustomWorkflow
};
