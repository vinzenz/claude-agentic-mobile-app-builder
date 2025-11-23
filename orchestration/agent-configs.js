/**
 * Agent configurations for the 12 specialized AI agents
 * Defines capabilities, dependencies, and default settings for each agent type
 */

import { AgentType, ModelTier } from './types.js';

/**
 * Agent configuration schema
 * @typedef {Object} AgentConfig
 * @property {string} type - Agent type enum value
 * @property {string} name - Human-readable name
 * @property {string} description - Agent description
 * @property {string[]} dependencies - Agent types this agent depends on
 * @property {string} defaultModel - Default Claude model tier
 * @property {string} promptFile - System prompt file name
 * @property {Object} capabilities - Agent capabilities
 * @property {number} maxRetries - Maximum retry attempts
 * @property {number} timeoutMs - Execution timeout in milliseconds
 */

/**
 * Complete agent configurations
 * Dependencies form a DAG (Directed Acyclic Graph):
 *
 * PM (no deps)
 *   └── ARCHITECT (PM)
 *         ├── TL_FRONTEND (ARCHITECT, UIUX)
 *         │     └── DEV_FRONTEND (TL_FRONTEND)
 *         └── TL_BACKEND (ARCHITECT)
 *               └── DEV_BACKEND (TL_BACKEND)
 *   └── UIUX (PM)
 *
 * Independent agents that can run after development:
 *   TEST, CQR, SR, DOE
 */
export const AGENT_CONFIGS = Object.freeze({
  [AgentType.PM]: {
    type: AgentType.PM,
    name: 'Project Manager',
    description: 'High-level project planning, requirements analysis, and coordination',
    dependencies: [],
    defaultModel: ModelTier.OPUS,
    promptFile: 'pm.md',
    capabilities: {
      requirementsAnalysis: true,
      projectPlanning: true,
      taskBreakdown: true,
      riskAssessment: true,
      stakeholderCommunication: true
    },
    maxRetries: 3,
    timeoutMs: 300000 // 5 minutes
  },

  [AgentType.ARCHITECT]: {
    type: AgentType.ARCHITECT,
    name: 'System Architect',
    description: 'Technical architecture design, system modeling, and technology decisions',
    dependencies: [AgentType.PM],
    defaultModel: ModelTier.OPUS,
    promptFile: 'architect.md',
    capabilities: {
      systemDesign: true,
      technologySelection: true,
      apiDesign: true,
      dataModeling: true,
      scalabilityPlanning: true,
      integrationDesign: true
    },
    maxRetries: 3,
    timeoutMs: 300000
  },

  [AgentType.UIUX]: {
    type: AgentType.UIUX,
    name: 'UI/UX Designer',
    description: 'User interface design, user experience flows, and design systems',
    dependencies: [AgentType.PM],
    defaultModel: ModelTier.SONNET,
    promptFile: 'uiux.md',
    capabilities: {
      wireframing: true,
      userFlowDesign: true,
      componentDesign: true,
      designSystemCreation: true,
      accessibilityReview: true,
      responsiveDesign: true
    },
    maxRetries: 3,
    timeoutMs: 240000 // 4 minutes
  },

  [AgentType.TL_FRONTEND]: {
    type: AgentType.TL_FRONTEND,
    name: 'Tech Lead - Frontend',
    description: 'Frontend architecture, component structure, and state management',
    dependencies: [AgentType.ARCHITECT, AgentType.UIUX],
    defaultModel: ModelTier.SONNET,
    promptFile: 'tl-frontend.md',
    capabilities: {
      frontendArchitecture: true,
      componentStructure: true,
      stateManagement: true,
      buildConfiguration: true,
      performanceOptimization: true,
      codeStandards: true
    },
    maxRetries: 3,
    timeoutMs: 240000
  },

  [AgentType.TL_BACKEND]: {
    type: AgentType.TL_BACKEND,
    name: 'Tech Lead - Backend',
    description: 'Backend architecture, API design, and service structure',
    dependencies: [AgentType.ARCHITECT],
    defaultModel: ModelTier.SONNET,
    promptFile: 'tl-backend.md',
    capabilities: {
      backendArchitecture: true,
      apiDesign: true,
      databaseDesign: true,
      serviceStructure: true,
      authenticationDesign: true,
      codeStandards: true
    },
    maxRetries: 3,
    timeoutMs: 240000
  },

  [AgentType.DEV_FRONTEND]: {
    type: AgentType.DEV_FRONTEND,
    name: 'Frontend Developer',
    description: 'UI component implementation, styling, and frontend logic',
    dependencies: [AgentType.TL_FRONTEND],
    defaultModel: ModelTier.SONNET,
    promptFile: 'dev-frontend.md',
    capabilities: {
      componentImplementation: true,
      styling: true,
      stateImplementation: true,
      apiIntegration: true,
      unitTesting: true,
      responsiveImplementation: true
    },
    maxRetries: 3,
    timeoutMs: 360000 // 6 minutes
  },

  [AgentType.DEV_BACKEND]: {
    type: AgentType.DEV_BACKEND,
    name: 'Backend Developer',
    description: 'API implementation, database operations, and business logic',
    dependencies: [AgentType.TL_BACKEND],
    defaultModel: ModelTier.SONNET,
    promptFile: 'dev-backend.md',
    capabilities: {
      apiImplementation: true,
      databaseOperations: true,
      businessLogic: true,
      dataValidation: true,
      errorHandling: true,
      unitTesting: true
    },
    maxRetries: 3,
    timeoutMs: 360000
  },

  [AgentType.TEST]: {
    type: AgentType.TEST,
    name: 'Test Engineer',
    description: 'Test strategy, test case design, and test implementation',
    dependencies: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
    defaultModel: ModelTier.SONNET,
    promptFile: 'test.md',
    capabilities: {
      testStrategy: true,
      unitTestDesign: true,
      integrationTestDesign: true,
      e2eTestDesign: true,
      testAutomation: true,
      coverageAnalysis: true
    },
    maxRetries: 3,
    timeoutMs: 300000
  },

  [AgentType.CQR]: {
    type: AgentType.CQR,
    name: 'Code Quality Reviewer',
    description: 'Code review, quality assessment, and improvement suggestions',
    dependencies: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
    defaultModel: ModelTier.SONNET,
    promptFile: 'cqr.md',
    capabilities: {
      codeReview: true,
      qualityAssessment: true,
      refactoringSuggestions: true,
      bestPractices: true,
      codeSmellDetection: true,
      maintainabilityAnalysis: true
    },
    maxRetries: 3,
    timeoutMs: 240000
  },

  [AgentType.SR]: {
    type: AgentType.SR,
    name: 'Security Reviewer',
    description: 'Security analysis, vulnerability assessment, and security recommendations',
    dependencies: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
    defaultModel: ModelTier.OPUS,
    promptFile: 'sr.md',
    capabilities: {
      securityAnalysis: true,
      vulnerabilityAssessment: true,
      threatModeling: true,
      securityBestPractices: true,
      complianceCheck: true,
      penetrationTestPlanning: true
    },
    maxRetries: 3,
    timeoutMs: 300000
  },

  [AgentType.DOE]: {
    type: AgentType.DOE,
    name: 'DevOps Engineer',
    description: 'Deployment configuration, CI/CD setup, and infrastructure',
    dependencies: [AgentType.DEV_FRONTEND, AgentType.DEV_BACKEND],
    defaultModel: ModelTier.HAIKU,
    promptFile: 'doe.md',
    capabilities: {
      cicdSetup: true,
      deploymentConfiguration: true,
      containerization: true,
      infrastructureAsCode: true,
      monitoringSetup: true,
      environmentConfiguration: true
    },
    maxRetries: 3,
    timeoutMs: 180000 // 3 minutes
  }
});

/**
 * Get agent configuration by type
 * @param {string} agentType - Agent type enum value
 * @returns {AgentConfig|undefined}
 */
export function getAgentConfig(agentType) {
  return AGENT_CONFIGS[agentType];
}

/**
 * Get all agent types
 * @returns {string[]}
 */
export function getAllAgentTypes() {
  return Object.keys(AGENT_CONFIGS);
}

/**
 * Get dependencies for an agent
 * @param {string} agentType - Agent type
 * @returns {string[]}
 */
export function getAgentDependencies(agentType) {
  const config = AGENT_CONFIGS[agentType];
  return config ? config.dependencies : [];
}

/**
 * Get all agents that depend on a given agent
 * @param {string} agentType - Agent type
 * @returns {string[]}
 */
export function getDependentAgents(agentType) {
  return Object.values(AGENT_CONFIGS)
    .filter(config => config.dependencies.includes(agentType))
    .map(config => config.type);
}

/**
 * Topologically sort agents based on dependencies
 * @param {string[]} agentTypes - Agent types to sort
 * @returns {string[][]} - Sorted agent types in execution order (grouped by level)
 */
export function topologicalSortAgents(agentTypes) {
  const inDegree = new Map();
  const adjacency = new Map();

  // Initialize
  for (const type of agentTypes) {
    inDegree.set(type, 0);
    adjacency.set(type, []);
  }

  // Build graph
  for (const type of agentTypes) {
    const deps = getAgentDependencies(type).filter(d => agentTypes.includes(d));
    inDegree.set(type, deps.length);
    for (const dep of deps) {
      adjacency.get(dep).push(type);
    }
  }

  // Kahn's algorithm with level grouping
  const levels = [];
  let remaining = [...agentTypes];

  while (remaining.length > 0) {
    const currentLevel = remaining.filter(type => inDegree.get(type) === 0);

    if (currentLevel.length === 0) {
      throw new Error('Circular dependency detected in agent configuration');
    }

    levels.push(currentLevel);

    for (const type of currentLevel) {
      for (const dependent of adjacency.get(type)) {
        inDegree.set(dependent, inDegree.get(dependent) - 1);
      }
    }

    remaining = remaining.filter(type => !currentLevel.includes(type));
  }

  return levels;
}

/**
 * Validate agent dependencies are satisfied
 * @param {string[]} agentTypes - Agent types to validate
 * @param {Set<string>} completedAgents - Already completed agents
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateDependencies(agentTypes, completedAgents = new Set()) {
  const missing = [];

  for (const type of agentTypes) {
    const deps = getAgentDependencies(type);
    for (const dep of deps) {
      if (!completedAgents.has(dep) && !agentTypes.includes(dep)) {
        missing.push(`${type} requires ${dep}`);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export default {
  AGENT_CONFIGS,
  getAgentConfig,
  getAllAgentTypes,
  getAgentDependencies,
  getDependentAgents,
  topologicalSortAgents,
  validateDependencies
};
