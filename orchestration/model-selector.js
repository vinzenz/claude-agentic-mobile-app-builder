/**
 * Model selector for Claude tier selection per agent
 * Implements cost optimization by assigning appropriate model tiers
 */

import { AgentType, ModelTier } from './types.js';
import { getAgentConfig } from './agent-configs.js';

/**
 * Default model tier mappings
 * - opus: Deep reasoning tasks (PM, ARCHITECT, SR)
 * - sonnet: Balanced tasks (most agents)
 * - haiku: Simple procedural tasks (DOE)
 */
const DEFAULT_MODEL_MAPPINGS = Object.freeze({
  [AgentType.PM]: ModelTier.OPUS,
  [AgentType.ARCHITECT]: ModelTier.OPUS,
  [AgentType.UIUX]: ModelTier.SONNET,
  [AgentType.TL_FRONTEND]: ModelTier.SONNET,
  [AgentType.TL_BACKEND]: ModelTier.SONNET,
  [AgentType.DEV_FRONTEND]: ModelTier.SONNET,
  [AgentType.DEV_BACKEND]: ModelTier.SONNET,
  [AgentType.TEST]: ModelTier.SONNET,
  [AgentType.CQR]: ModelTier.SONNET,
  [AgentType.SR]: ModelTier.OPUS,
  [AgentType.DOE]: ModelTier.HAIKU
});

/**
 * Model tier hierarchy for constraint enforcement
 */
const MODEL_HIERARCHY = Object.freeze({
  [ModelTier.HAIKU]: 0,
  [ModelTier.SONNET]: 1,
  [ModelTier.OPUS]: 2
});

/**
 * Cost multipliers relative to haiku (approximate)
 */
const COST_MULTIPLIERS = Object.freeze({
  [ModelTier.HAIKU]: 1,
  [ModelTier.SONNET]: 5,
  [ModelTier.OPUS]: 15
});

/**
 * @typedef {Object} ModelSelectorOptions
 * @property {string} [maxTier] - Maximum allowed tier (constraint from CLI)
 * @property {Object} [overrides] - Per-agent model overrides
 * @property {boolean} [optimizeCost] - Whether to optimize for cost
 */

/**
 * ModelSelector singleton class
 */
class ModelSelector {
  constructor() {
    this.options = {
      maxTier: ModelTier.OPUS,
      overrides: {},
      optimizeCost: false
    };
  }

  /**
   * Configure the model selector
   * @param {ModelSelectorOptions} options
   */
  configure(options) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Select the appropriate model tier for an agent
   * @param {string} agentType - Agent type
   * @param {Object} [context] - Execution context
   * @returns {string} - Selected model tier
   */
  selectModel(agentType, context = {}) {
    // Check for explicit override
    if (this.options.overrides[agentType]) {
      return this.enforceMaxTier(this.options.overrides[agentType]);
    }

    // Get default from agent config
    const agentConfig = getAgentConfig(agentType);
    let selectedModel = agentConfig?.defaultModel || DEFAULT_MODEL_MAPPINGS[agentType] || ModelTier.SONNET;

    // Apply context-based selection if applicable
    if (context.complexity === 'low' && this.options.optimizeCost) {
      selectedModel = this.downgrade(selectedModel);
    } else if (context.complexity === 'high') {
      selectedModel = this.upgrade(selectedModel);
    }

    return this.enforceMaxTier(selectedModel);
  }

  /**
   * Enforce maximum tier constraint
   * @param {string} tier - Requested tier
   * @returns {string} - Constrained tier
   */
  enforceMaxTier(tier) {
    const maxLevel = MODEL_HIERARCHY[this.options.maxTier] ?? MODEL_HIERARCHY[ModelTier.OPUS];
    const requestedLevel = MODEL_HIERARCHY[tier] ?? MODEL_HIERARCHY[ModelTier.SONNET];

    if (requestedLevel > maxLevel) {
      // Return the maximum allowed tier
      return this.options.maxTier;
    }
    return tier;
  }

  /**
   * Downgrade model tier by one level
   * @param {string} tier - Current tier
   * @returns {string} - Downgraded tier
   */
  downgrade(tier) {
    const level = MODEL_HIERARCHY[tier];
    if (level === 0) return ModelTier.HAIKU;
    if (level === 1) return ModelTier.HAIKU;
    return ModelTier.SONNET;
  }

  /**
   * Upgrade model tier by one level
   * @param {string} tier - Current tier
   * @returns {string} - Upgraded tier
   */
  upgrade(tier) {
    const level = MODEL_HIERARCHY[tier];
    if (level === 0) return ModelTier.SONNET;
    if (level === 1) return ModelTier.OPUS;
    return ModelTier.OPUS;
  }

  /**
   * Estimate cost for a workflow based on agent models
   * @param {string[]} agentTypes - Agent types in workflow
   * @param {number} [tokensPerAgent] - Estimated tokens per agent
   * @returns {Object} - Cost breakdown
   */
  estimateCost(agentTypes, tokensPerAgent = 10000) {
    const breakdown = {};
    let totalMultiplier = 0;

    for (const agentType of agentTypes) {
      const model = this.selectModel(agentType);
      const multiplier = COST_MULTIPLIERS[model];
      breakdown[agentType] = { model, multiplier };
      totalMultiplier += multiplier;
    }

    return {
      breakdown,
      totalMultiplier,
      relativeCost: totalMultiplier / agentTypes.length,
      estimatedTokens: tokensPerAgent * agentTypes.length
    };
  }

  /**
   * Get all available model tiers
   * @returns {string[]}
   */
  getAvailableTiers() {
    return Object.values(ModelTier);
  }

  /**
   * Check if a tier is valid
   * @param {string} tier
   * @returns {boolean}
   */
  isValidTier(tier) {
    return Object.values(ModelTier).includes(tier);
  }

  /**
   * Get model CLI argument for Claude
   * @param {string} tier - Model tier
   * @returns {string} - CLI model argument
   */
  getModelCliArg(tier) {
    const modelNames = {
      [ModelTier.HAIKU]: 'claude-3-haiku-20240307',
      [ModelTier.SONNET]: 'claude-sonnet-4-20250514',
      [ModelTier.OPUS]: 'claude-3-opus-20240229'
    };
    return modelNames[tier] || modelNames[ModelTier.SONNET];
  }
}

// Singleton instance
let instance = null;

/**
 * Get the ModelSelector singleton instance
 * @returns {ModelSelector}
 */
export function getModelSelector() {
  if (!instance) {
    instance = new ModelSelector();
  }
  return instance;
}

/**
 * Select model for an agent (convenience function)
 * @param {string} agentType
 * @param {Object} [context]
 * @returns {string}
 */
export function selectModelForAgent(agentType, context) {
  return getModelSelector().selectModel(agentType, context);
}

/**
 * Get CLI model argument for an agent (convenience function)
 * @param {string} agentType
 * @returns {string}
 */
export function getModelCliArgForAgent(agentType) {
  const tier = selectModelForAgent(agentType);
  return getModelSelector().getModelCliArg(tier);
}

export default {
  getModelSelector,
  selectModelForAgent,
  getModelCliArgForAgent,
  ModelTier,
  MODEL_HIERARCHY,
  COST_MULTIPLIERS
};
