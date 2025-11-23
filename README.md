# Agentic Mobile App Builder

A multi-agent orchestration framework for mobile application development using Claude AI. The system coordinates 12 specialized AI agents to build, test, and deploy mobile applications through automated workflows.

## Architecture

```
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
```

## Features

- **12 Specialized Agents**: PM, Architect, UI/UX, Tech Leads, Developers, Testers, Security, DevOps
- **7 Predefined Workflows**: Full app generation, feature addition, bug fixing, and more
- **Model Tiering**: Cost optimization with Opus/Sonnet/Haiku selection per agent
- **Session Persistence**: File-based crash recovery with checkpoints
- **Git Integration**: Automatic branch creation and PR management
- **PMS-Driven Communication**: Agents read context from tasks, not direct passing

## Quick Start

```bash
# Install dependencies
npm install

# Create a new mobile app
./agentic-builder create-app MyApp

# Add a feature
./agentic-builder add-feature "user authentication"

# Fix a bug
./agentic-builder fix-bug "login screen crashes"
```

## Commands

### Workflow Commands

```bash
# Run a specific workflow
./agentic-builder run <workflow> [options]

# Available workflows:
# - FULL_APP_GENERATION
# - FEATURE_ADDITION
# - BUG_FIX
# - REFACTORING
# - TEST_GENERATION
# - CODE_REVIEW
# - SECURITY_AUDIT

# List workflows
./agentic-builder workflows

# List agents
./agentic-builder agents
```

### Session Management

```bash
# List sessions
./agentic-builder list [--all] [--zombies] [--status <status>]

# Check status
./agentic-builder status <session-id>

# Resume from checkpoint
./agentic-builder resume <session-id>

# Cancel workflow
./agentic-builder cancel <session-id> [--force] [--cleanup]

# View logs
./agentic-builder logs <session-id> [--follow]
```

### Utilities

```bash
# Token usage statistics
./agentic-builder usage [--breakdown]

# Clean old sessions
./agentic-builder clean [--days <n>]
```

## Agents

| Agent | Model | Description |
|-------|-------|-------------|
| PM | Opus | Project planning and requirements |
| ARCHITECT | Opus | System architecture and design |
| UIUX | Sonnet | UI/UX design and flows |
| TL_FRONTEND | Sonnet | Frontend technical leadership |
| TL_BACKEND | Sonnet | Backend technical leadership |
| DEV_FRONTEND | Sonnet | Frontend implementation |
| DEV_BACKEND | Sonnet | Backend implementation |
| TEST | Sonnet | Test strategy and implementation |
| CQR | Sonnet | Code quality review |
| SR | Opus | Security review and analysis |
| DOE | Haiku | DevOps and deployment |

## Directory Structure

```
.
├── agentic-builder          # Main entry point (bash)
├── orchestration/           # Workflow orchestration
│   ├── workflow-engine.js   # Main orchestrator
│   ├── session-manager.js   # Session persistence
│   ├── agent-configs.js     # Agent definitions
│   ├── model-selector.js    # Model tier selection
│   ├── predefined-workflows.js
│   └── types.js
├── pms/                     # Project Management System
│   ├── task-manager.js
│   ├── context-serializer.js
│   └── types.js
├── src/
│   ├── cli/                 # CLI commands
│   │   ├── index.ts
│   │   └── commands/
│   ├── git/                 # Git integration
│   │   ├── git-manager.js
│   │   └── pr-manager.js
│   ├── agents/              # Agent utilities
│   │   ├── response-parser.js
│   │   └── prompt-loader.js
│   └── claude-cli/          # Claude CLI integration
├── .prompts/agents/         # Agent system prompts
├── .sessions/               # Session storage
└── .tasks/                  # Task storage
```

## Configuration

### Model Tier Override

```bash
# Limit to sonnet tier (cheaper)
./agentic-builder run FULL_APP_GENERATION --max-tier sonnet

# Limit to haiku (cheapest)
./agentic-builder run BUG_FIX --max-tier haiku
```

### Skip Git/PR

```bash
# Skip branch creation
./agentic-builder run FULL_APP_GENERATION --no-branch

# Skip PR creation
./agentic-builder run FULL_APP_GENERATION --no-pr
```

## Requirements

- Node.js 18+
- Claude CLI installed and authenticated
- Git (for version control features)
- GitHub CLI (for PR features)

## Development

```bash
# Run CLI directly
npx tsx src/cli/index.ts <command>

# Run with npm
npm run cli -- <command>
```

## License

MIT
