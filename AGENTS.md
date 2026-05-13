# AGENTS.md

## Terminal rules

- I am using Windows PowerShell in VS Code.
- Do not use Linux/bash commands such as `rm -rf`, `chmod`, `grep`, `cat`, `source`, or `export`.
- Use PowerShell commands only.
- Before running project commands, first run:
  - `pwd`
  - `node --version`
  - `npm --version`
  - `python --version`
- Always run commands from the project root unless a package folder is specified.
- If a command fails, read the error message and explain it before trying another command.
- Do not repeatedly run random alternative commands.

## Project commands

- Install dependencies with:
  `npm install`
- Start the development server with:
  `npm run dev`
- Run tests with:
  `npm test`
- If the app is inside a subfolder, cd into that folder first.