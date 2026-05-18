# gamedev — Claude workflow

Default integration flow is the one from `/Users/rico/.claude/CLAUDE.md` ("Git Workflow" + "Task-completion DONE block"). Apply it on every code task in this repo, not only on `/todos` chips.

## Per-task lifecycle

For any task whose goal is "land a change on main" (single feature ask, bug fix, manual-notes chip):

1. Implement in the current worktree.
2. Commit (concise "why", no Claude attribution).
3. `git rebase main` on the worktree branch.
4. `git -C /Users/rico/projects/gamedev merge --ff-only <branch>`.
5. If ff-merge is **blocked by an in-progress merge/rebase in main worktree** (`MERGE_HEAD`/`REBASE_HEAD`/`CHERRY_PICK_HEAD`, unmerged index entries, or `AUTO_MERGE` present): wait 3 min and retry, up to 3 times. Do NOT touch the foreign unmerged files — that may be the user's own conflict resolution from a parallel session. If still blocked after 3 retries, stop and report state.
6. If ff-merge is **blocked by clean WIP in main worktree** (no merge artifacts, just dirty files / staged edits): stash → merge → pop per global CLAUDE.md. Don't ask.
7. Resolve any rebase conflicts in place. No merge commits, ever.
8. If the task came from a vault manual-notes file: flip the line `- [ ]` → `- [x] … → <one-line resolution>` after the merge lands. Commit the vault change separately in the ricos.site submodule.

## DONE block

End the response with a final fenced code block — must be the last thing in the response, nothing after:

````
✅ DONE and merged into main as <short-sha> <commit-subject>
````

Use `git rev-parse --short HEAD` on main after the ff-merge.

On abort (unresolved conflicts, build broken, item already done, blocked by foreign merge state after retries): do NOT print the block. Its absence is the signal that something failed.

Skip the block for pure-research tasks and exploratory questions that aren't supposed to merge.

## Detecting in-progress merge vs WIP

Before stashing, check for merge artifacts in the main worktree:

```
ls /Users/rico/projects/gamedev/.git/MERGE_HEAD \
   /Users/rico/projects/gamedev/.git/REBASE_HEAD \
   /Users/rico/projects/gamedev/.git/CHERRY_PICK_HEAD \
   /Users/rico/projects/gamedev/.git/AUTO_MERGE 2>/dev/null
git -C /Users/rico/projects/gamedev ls-files -u | head
```

If any of those exist or `ls-files -u` returns anything → in-progress merge, wait + retry. Otherwise → clean WIP, stash → merge → pop.
