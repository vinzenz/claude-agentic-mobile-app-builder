  Agentic Mobile App Builder Framework - Recreation Prompt

  Overview

  Build a multi-agent orchestration framework that coordinates 12 specialized AI agents to develop mobile applications. The system uses PMS-driven communication (agents read context from tasks, not direct passing), file-based
  session persistence for crash recovery, git integration for version control, and model tiering (opus/sonnet/haiku) for cost optimization.

  ---
  Core Architecture

  ┌─────────────────────────────────────────────────────────┐
  │                      CLI Interface                       │
  │  (agentic-builder bash script + src/cli/ TypeScript)    │
  ├─────────────────────────────────────────────────────────┤
  │                 Workflow Orchestration                   │
  │  WorkflowEngine, SessionManager, ModelSelector          │
  ├─────────────────────────────────────────────────────────┤
  │              Agent Execution Framework                   │
  │  AgentConfigs, Claude CLI Integration, ResponseParser   │
  ├─────────────────────────────────────────────────────────┤
  │         Project Management System (PMS)                  │
  │  TaskManager, ContextSerializer (XML format)            │
  ├─────────────────────────────────────────────────────────┤
  │              Integration Services                        │
  │  GitManager, PRManager, ReviewGates                     │
  └─────────────────────────────────────────────────────────┘

  ---
  Key Components to Implement

  1. Orchestration Module (orchestration/)

  workflow-engine.js - Singleton, extends EventEmitter
  - startWorkflow(definition, context) - Creates run, git branch, executes stages
  - executeStage(run, stage) - Runs agents (parallel or sequential)
  - spawnAndExecuteAgent(run, agentType, input) - Creates PMS task, calls Claude CLI, parses response
  - cancelWorkflow(runId) - Stops execution, marks agents failed
  - Emits events: workflow_started, stage_completed, agent_spawned, agent_completed, agent_failed

  session-manager.js - Singleton, extends EventEmitter
  - Sessions stored in .sessions/<sessionId>.json
  - Status lifecycle: running → paused|failed|completed, failed → resumable (if checkpoints exist)
  - checkpoint(sessionId, data) - Saves stage completion state
  - restore(sessionId) - Returns session + latest checkpoint for resumption

  agent-configs.js - 12 agent types with dependencies:
  PM (no deps) → ARCHITECT (PM) → TL_FRONTEND (ARCHITECT,UIUX) → DEV_FRONTEND
             → UIUX (PM)     → TL_BACKEND (ARCHITECT)      → DEV_BACKEND
                                                            → TEST, CQR, SR, DOE

  model-selector.js - Select Claude tier per agent:
  - opus: PM, ARCHITECT, SR (deep reasoning)
  - sonnet: UIUX, DEV_*, TL_*, TEST, CQR (balanced)
  - haiku: DOE (simple procedural)

  predefined-workflows.js - 7 workflow templates:
  - FULL_APP_GENERATION (6 stages, all agents)
  - FEATURE_ADDITION, BUG_FIX, REFACTORING, TEST_GENERATION, CODE_REVIEW, SECURITY_AUDIT

  types.js - Enums and interfaces:
  enum AgentType { PM, ARCHITECT, UIUX, TL_FRONTEND, TL_BACKEND, DEV_FRONTEND, DEV_BACKEND, TEST, CQR, SR, DOE }
  enum AgentStatus { IDLE, SPAWNING, RUNNING, COMPLETED, FAILED }
  enum WorkflowStatus { PENDING, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED }

  2. PMS Module (pms/)

  task-manager.js - File-based task store in .tasks/
  - Task IDs: TASK-0001, TASK-0002, etc.
  - Status: pending → in_progress → completed|blocked|failed
  - Dependency tracking: deps[], blocked_by[], blocking[]

  context-serializer.js - XML format for agent input/output:
  <task_context>
    <task_id>TASK-0001</task_id>
    <summary>Create requirements</summary>
    <dependency_outputs>...</dependency_outputs>
  </task_context>

  3. CLI Module (src/cli/)

  Commands:
  - run <workflow> - Start workflow with signal handlers for graceful shutdown
  - list [--all] [--zombies] [--status X] - List sessions with filtering
  - status <id> - Show run details
  - cancel <id> [--force] [--cleanup] - Cancel workflow, detect zombies
  - resume <id> - Resume from checkpoint
  - logs <id> - View execution logs
  - usage - Token usage stats

  Zombie detection: Session status='running' but no active WorkflowRun in engine memory

  4. Git Integration (src/git/)

  git-manager.js:
  - createBranch(name) - Branch format: feature/<project>/<YYYYMMDD>
  - commitFiles(files, message) - Commit per agent: [AGENT_TYPE] summary
  - getStatus() - Check clean/staged/untracked

  pr-manager.js:
  - createPR(branch, {title, body, draft}) - Via gh pr create
  - PR created as draft on workflow completion

  5. Agent Execution (src/agents/)

  response-parser.js:
  interface AgentOutput {
    success: boolean
    summary: string
    artifacts: Artifact[]  // {name, type, path, content}
    metadata: { tokensUsed, executionTime, filesCreated[], filesModified[] }
    nextSteps?: string[]
    warnings?: string[]
  }

  6. Main Entry Point (agentic-builder bash script)

  Wrapper script that:
  - Provides user-friendly commands: create-app, add-feature, fix-bug, etc.
  - Maps to CLI: run_cli() { npx tsx src/cli/index.ts "$@"; }
  - Note at top: "IMPORTANT: When adding commands, update BOTH this file AND src/cli/index.ts"

  ---
  Data Flow

  CLI Input → Load WorkflowDefinition → Create Session
  → Create Git Branch → Topological Sort Stages
  → For Each Stage:
      → For Each Agent:
          → Create PMS Task (serialize deps to XML)
          → Select Model Tier
          → Call Claude CLI (headless)
          → Parse Response → Extract artifacts
          → Update PMS Task → Commit to Git
      → Checkpoint Session
  → Create PR → Return WorkflowRun

  ---
  Key Design Patterns

  1. Singleton: WorkflowEngine, SessionManager, GitManager - get*() functions
  2. EventEmitter: All major state changes emit events
  3. PMS-Driven Communication: Agents receive task IDs, read context from PMS
  4. Topological Sort: Stages/agents execute in dependency order
  5. Checkpointing: Save state at stage completion for resumability

  ---
  File Structure

  orchestration/
    workflow-engine.js, session-manager.js, agent-configs.js
    types.js, model-selector.js, predefined-workflows.js
    pms-integration.js, auto-resume.js, compaction.js
  pms/
    task-manager.js, context-serializer.js, types.js
  src/cli/
    index.ts, commands/{run,status,list,cancel,resume,logs,usage}.ts
  src/agents/
    prompt-loader.js, response-parser.js
  src/git/
    git-manager.js, pr-manager.js
  src/claude-cli/
    index.js
  .sessions/     # Session JSON files
  .tasks/        # Task storage
  .prompts/agents/  # Agent system prompts
  agentic-builder   # Main bash entry point

  ---
  Critical Implementation Details

  1. Signal Handlers (run.ts): Handle SIGINT/SIGTERM/SIGHUP to mark sessions failed on crash
  2. Zombie Detection (cancel.ts, list.ts): Session status='running' + no active engine run = zombie
  3. PR Failure Mode (workflow-engine.js): prFailureMode: 'fail'|'warn' - throw or log
  4. Session Recovery: On resume, skip completed agents, continue from checkpoint
  5. Model Selection: Per-agent config with maxTier constraint from CLI

  ---
  This framework enables fault-tolerant, resumable multi-agent workflows with full git integration and cost-optimized model selection.
