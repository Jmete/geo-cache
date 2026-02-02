#!/bin/bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PROMPT="$(cat <<'EOF'
Use these as the source of truth:
- plans/prd.json
- plans/progress.txt

1. Read the prd and progress file.
2. Find the next incomplete task that makes sense to implement based on dependencies and app development flow and implement it.
3. Make sure all tests pass and are validated.
4. Update prd.json file if passes:true
5. After completing each task, append to progress.txt:
- Task completed and PRD item reference
- Key decisions made and reasoning
- Files changed
- Any blockers or notes for next iteration
Keep entries concise. Sacrifice grammar for the sake of concision. This file helps future iterations skip exploration.
6. Before committing, run ALL feedback loops:
1. TypeScript: npm run typecheck (must pass with no errors)
2. Tests: npm run test (must pass)
3. Lint: npm run lint (must pass)
Do NOT commit if any feedback loop fails. Fix issues first.
7. Commit your changes and then git push.
ONLY DO ONE TASK AT A TIME.
Keep changes small and focused:
- One logical change per commit
- If a task feels too large, break it into subtasks
- Prefer multiple small commits over one large commit
- Run feedback loops after each change, not at the end
Quality over speed. Small steps compound into big progress.
If a prd task requires manual human input such as configuring an online dashboard in cloudfalre, let me know the steps to complete it.
If the PRD is complete, output <promise>COMPLETE</promise>.
EOF
)"

codex \
  -a never \
  --search \
  -c sandbox_workspace_write.network_access=true \
  exec \
  --cd "$REPO_ROOT" \
  --sandbox workspace-write \
  "$PROMPT"