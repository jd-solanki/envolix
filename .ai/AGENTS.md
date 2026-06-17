## Skill reference loading

Skills ship a main `SKILL.md` plus optional files in same directory like `references/*`, `examples/*`, `SAMPLE.md`, etc. The main file `SKILL.md` is always loaded; reference files are loaded on demand. Load them deliberately — not all up-front, not blindly.

When you invoke a skill:

1. **Build a menu.** Read the reference list/descriptions in the skill's main file. Only if it lists none, glance at each `references/*.md` (its `load-when` line or first heading) to learn its topic.
2. **Classify each reference:** - **Core / unconditional** (no condition stated) → load now. - **Conditional** (tied to a language, task type, or other context — e.g. Python vs JS, bug vs feature) → load *only* if this task meets the condition.
3. **Decide out loud** before loading, e.g.: `Task = bug fix → loading bug-fixing.md; skipping feature-work.md.`
4. **Load only what you selected** — the union if several conditions apply.
5. **Don't re-read** what's already loaded. Re-evaluate only if the task changes.

When in doubt, prefer loading too few over too many — you can always read a reference later once the task makes the condition clear.
