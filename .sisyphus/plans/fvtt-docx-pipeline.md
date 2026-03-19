# Foundry VTT Data Pre-processing Plan (Docx to Standardized YAML)

## Context
User has a raw data source (`.docx` statblock) and wants to establish a pipeline to convert such data into our tool's supported YAML format. The strategy is to leverage an LLM (Gemini) to perform the "dirty" parsing/formatting, guided by a strict "Universal Template".

## Goals
1.  **Analyze Source**: Understand the structure of `阿利克辛底栖魔鱼.docx`.
2.  **Define Universal Template**: Create `templates/gemini-prompt.md`. This file will serve as:
    -   A human-readable standard.
    -   A system prompt/knowledge base for Gemini to format raw data.
    -   The direct input format for our existing `fvtt-import` tool.
3.  **Verify Pipeline**: Ensure data from the Docx can be mapped to this template and successfully imported.

---

## Task Flow

```
[1. Recon Docx] -> [2. Design Template] -> [3. Create Gemini Prompt]
       ↓
[4. Manual Simulation (Docx -> YAML)]
       ↓
[5. Run Importer (Validation)]
```

---

## TODOs

- [ ] 1. Reconnaissance: Parse Docx
  - **Tool**: Use `mammoth` (npm package) to convert `data/阿利克辛底栖魔鱼 DND 5e 怪物图鉴.docx` to Markdown.
  - **Output**: Read the content to understand how attributes, actions, and features are currently formatted in the user's workflow.

- [ ] 2. Design "Universal Template" (Standard Input)
  - **File**: `templates/universal-statblock.md` (or update `npc-example.md`).
  - **Content**: A superset of `npc-example.md` but with *comments* and *instructions* for the LLM/User (e.g., `# Fill exact value here, do not use formula`).
  - **Key Features**: Cover all 4 optimizations (Skill 0.5, DM/DV, Lair, Hybrid Spells).

- [ ] 3. Create Gemini System Prompt
  - **File**: `docs/gemini-instructions.md`.
  - **Content**: Explicit instructions for Gemini.
    -   "You are a D&D 5e Data Converter."
    -   "Input: Raw text."
    -   "Output: Strictly valid YAML following this schema..."
    -   Include specific rules for transforming text actions (e.g., "Melee Weapon Attack" -> `[近战武器攻击]`).

- [ ] 4. Simulation & Verification
  - **Action**: Manually convert the "Aboleth" docx content into a new file `output/aboleth-converted.md` following the rules.
  - **Run**: `bun run src/index.ts output/aboleth-converted.md`.
  - **Check**: Verify JSON output is valid.

## Deliverables
- `docs/gemini-instructions.md`: The "Magic Spell" to make Gemini do the work.
- `templates/universal-template.md`: The target definition.
