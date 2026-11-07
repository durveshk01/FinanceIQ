# Contributing to FinanceIQ

FinanceIQ is a portfolio-focused fintech project. Contributions should keep the project honest, testable, and easy to evaluate.

## Local Development

```bash
npm install
npm run dev
```

## Quality Checks

Run these before opening a pull request:

```bash
npm run lint
npm run build
npm run test
```

## Guidelines

- Do not remove privacy or demo-data labeling.
- Do not add fake security claims, user metrics, revenue claims, or production scale claims.
- Keep upload, analysis, chat, and export routes compatible with the existing frontend.
- Prefer focused tests for parsing, categorization, report generation, and export behavior.
- Keep UI changes responsive and accessible.

## Pull Request Checklist

- Lint passes.
- Build passes.
- Tests pass.
- Demo mode still works.
- Upload validation still works.
- Documentation is updated when behavior changes.
