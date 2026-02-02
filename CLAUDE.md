# Code Tips
- Concise code that is easy to read
- Follow best practices
- Prefer simple approaches, but security is important. Any insecurity should be mentioned and flagged for attention with an appropriate solution.
- Write efficient code. We want performant and efficient apps that are cost-efficient too.

# Reference Files
- plans/prd.json
- plans/progress.txt

# Main Steps To Follow
1. Read the prd and progress file.
2. Find the next incomplete task that makes sense to implement based on dependencies and app development flow and implement it.
3. Make sure all tests pass and are validated.
4. Update prd.json file if passes:true

5. After completing each task, append to progress.txt:
5.1 Task completed and PRD item reference
5.2 Key decisions made and reasoning
5.3 Files changed
5.4 Any blockers or notes for next iteration
Keep entries concise. Sacrifice grammar for the sake of concision. This file helps future iterations skip exploration.

6 Before committing, run ALL feedback loops:
6.1 TypeScript: npm run typecheck (must pass with no errors)
6.2 Tests: npm run test (must pass)
6.3 Lint: npm run lint (must pass)
Do NOT commit if any feedback loop fails. Fix issues first.

7. Commit your changes and then git push.

# Important Notes
- ONLY DO ONE TASK AT A TIME.

- Keep changes small and focused:
-- One logical change per commit
-- If a task feels too large, break it into subtasks
-- Prefer multiple small commits over one large commit
-- Run feedback loops after each change, not at the end

- Quality over speed. Small steps compound into big progress.
- If a prd task requires manual human input such as configuring an online dashboard in cloudfalre, let me know the steps to complete it
- We are using Wrangler V4. Make sure you adapt any commands or edits to it: https://developers.cloudflare.com/workers/wrangler/migration/update-v3-to-v4/