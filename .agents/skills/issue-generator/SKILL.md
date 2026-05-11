---
name: "issue-generator"
description: "Generates standardized Bug Report and Feature Request issues using the project's official GitHub ISSUE_TEMPLATE. Invoke when user needs to create pre-filled, ready-to-submit bug or feature request issues for the Polymind project."
---

# Issue Generator Skill

This skill automatically generates properly formatted issue content based on the project's official GitHub issue templates, pre-filling all required fields with user-provided information.

## Features
1. Supports both Bug Report and Feature Request issue types
2. Follows exactly the format of `.github/ISSUE_TEMPLATE/` templates in the project
3. Pre-fills common environment information automatically (device: Virtual Machine, OS: openEuler-24.03-LTS-SP2)
4. Generates content that is ready to copy and submit directly to GitHub Issues

## Usage Instructions
When invoking this skill, provide the following information:
1. Issue type (Bug Report / Feature Request)
2. Core problem or feature description
3. Any additional relevant details (reproduction steps, expected behavior, etc.)

## Example Outputs

### Bug Report Example
```markdown
---
name: Bug report
about: Create a report to help us improve
title: "[BUG] <Issue Title>"
labels: bug
assignees: ''

---
English content...
---
Chinese content...
```

### Feature Request Example
```markdown
---
name: Feature request
about: Suggest an idea for this project
title: "[Feature] <Issue Title>"
labels: enhancement
assignees: ''

---
English content...
---
Chinese content...
```
