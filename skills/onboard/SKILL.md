---
name: onboard
description: Configure CodeScope for this project. Detects project type, languages, and build commands, then walks through agent model selection and workflow preferences.
---

# CodeScope Onboarding

## Prerequisites
Check Node.js version >= 22. If not met, tell the user: "CodeScope requires Node.js 22 or later. Current version: {version}. Upgrade at https://nodejs.org"

Check if .claude/codescope/config.yml already exists. If yes, ask: "CodeScope is already configured. Would you like to: (1) Update existing config, or (2) Start fresh?"

## Onboarding Flow
This skill will be fully implemented. Run detection, model selection, and preference configuration in sequence.
