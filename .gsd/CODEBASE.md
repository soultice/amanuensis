# Codebase Map

Generated: 2026-04-16T06:39:24Z | Files: 214 | Described: 0/214
<!-- gsd:codebase-meta {"generatedAt":"2026-04-16T06:39:24Z","fingerprint":"127171196630bddaeed3954d169f41ad892d32b3","fileCount":214,"truncated":false} -->

### (root)/
- `.gitignore`
- `CLAUDE.md`
- `context.md`
- `electron.vite.config.ts`
- `package-lock.json`
- `package.json`
- `README.md`
- `tsconfig.json`
- `tsconfig.node.json`
- `tsconfig.web.json`

### .github/workflows/
- `.github/workflows/build.yml`

### .pi/
- `.pi/gsd-file-manifest.json`

### .pi/agents/
- `.pi/agents/gsd-advisor-researcher.md`
- `.pi/agents/gsd-assumptions-analyzer.md`
- `.pi/agents/gsd-codebase-mapper.md`
- `.pi/agents/gsd-debugger.md`
- `.pi/agents/gsd-executor.md`
- `.pi/agents/gsd-integration-checker.md`
- `.pi/agents/gsd-nyquist-auditor.md`
- `.pi/agents/gsd-phase-researcher.md`
- `.pi/agents/gsd-plan-checker.md`
- `.pi/agents/gsd-planner.md`
- `.pi/agents/gsd-project-researcher.md`
- `.pi/agents/gsd-research-synthesizer.md`
- `.pi/agents/gsd-roadmapper.md`
- `.pi/agents/gsd-ui-auditor.md`
- `.pi/agents/gsd-ui-checker.md`
- `.pi/agents/gsd-ui-researcher.md`
- `.pi/agents/gsd-user-profiler.md`
- `.pi/agents/gsd-verifier.md`

### .pi/gsd/
- `.pi/gsd/VERSION`

### .pi/gsd/agents/
- `.pi/gsd/agents/gsd-advisor-researcher.md`
- `.pi/gsd/agents/gsd-assumptions-analyzer.md`
- `.pi/gsd/agents/gsd-codebase-mapper.md`
- `.pi/gsd/agents/gsd-debugger.md`
- `.pi/gsd/agents/gsd-executor.md`
- `.pi/gsd/agents/gsd-integration-checker.md`
- `.pi/gsd/agents/gsd-nyquist-auditor.md`
- `.pi/gsd/agents/gsd-phase-researcher.md`
- `.pi/gsd/agents/gsd-plan-checker.md`
- `.pi/gsd/agents/gsd-planner.md`
- `.pi/gsd/agents/gsd-project-researcher.md`
- `.pi/gsd/agents/gsd-research-synthesizer.md`
- `.pi/gsd/agents/gsd-roadmapper.md`
- `.pi/gsd/agents/gsd-ui-auditor.md`
- `.pi/gsd/agents/gsd-ui-checker.md`
- `.pi/gsd/agents/gsd-ui-researcher.md`
- `.pi/gsd/agents/gsd-user-profiler.md`
- `.pi/gsd/agents/gsd-verifier.md`

### .pi/gsd/references/
- `.pi/gsd/references/checkpoints.md`
- `.pi/gsd/references/continuation-format.md`
- `.pi/gsd/references/decimal-phase-calculation.md`
- `.pi/gsd/references/git-integration.md`
- `.pi/gsd/references/git-planning-commit.md`
- `.pi/gsd/references/model-profile-resolution.md`
- `.pi/gsd/references/model-profiles.md`
- `.pi/gsd/references/phase-argument-parsing.md`
- `.pi/gsd/references/planning-config.md`
- `.pi/gsd/references/questioning.md`
- `.pi/gsd/references/tdd.md`
- `.pi/gsd/references/ui-brand.md`
- `.pi/gsd/references/user-profiling.md`
- `.pi/gsd/references/verification-patterns.md`
- `.pi/gsd/references/workstream-flag.md`

### .pi/gsd/templates/
- *(30 files: 29 .md, 1 .json)*

### .pi/gsd/templates/codebase/
- `.pi/gsd/templates/codebase/architecture.md`
- `.pi/gsd/templates/codebase/concerns.md`
- `.pi/gsd/templates/codebase/conventions.md`
- `.pi/gsd/templates/codebase/integrations.md`
- `.pi/gsd/templates/codebase/stack.md`
- `.pi/gsd/templates/codebase/structure.md`
- `.pi/gsd/templates/codebase/testing.md`

### .pi/gsd/templates/research-project/
- `.pi/gsd/templates/research-project/ARCHITECTURE.md`
- `.pi/gsd/templates/research-project/FEATURES.md`
- `.pi/gsd/templates/research-project/PITFALLS.md`
- `.pi/gsd/templates/research-project/STACK.md`
- `.pi/gsd/templates/research-project/SUMMARY.md`

### .pi/gsd/workflows/
- *(69 files: 64 .md, 5 .bak)*

### sidecar/
- `sidecar/amanuensis-sidecar.spec`
- `sidecar/pyproject.toml`

### sidecar/app/
- `sidecar/app/__init__.py`
- `sidecar/app/main.py`
- `sidecar/app/state.py`

### sidecar/app/routes/
- `sidecar/app/routes/__init__.py`
- `sidecar/app/routes/health.py`
- `sidecar/app/routes/model.py`
- `sidecar/app/routes/transcribe.py`

### sidecar/app/services/
- `sidecar/app/services/__init__.py`
- `sidecar/app/services/model_manager.py`
- `sidecar/app/services/transcription.py`

### src/main/
- `src/main/index.ts`
- `src/main/sidecar.ts`

### src/preload/
- `src/preload/index.ts`

### src/renderer/
- `src/renderer/index.html`

### src/renderer/src/
- `src/renderer/src/App.vue`
- `src/renderer/src/env.d.ts`
- `src/renderer/src/main.ts`

### src/renderer/src/assets/
- `src/renderer/src/assets/base.css`

### src/renderer/src/components/
- `src/renderer/src/components/AnnotationDialog.vue`
- `src/renderer/src/components/AnnotationPanel.vue`
- `src/renderer/src/components/AppStatusBar.vue`
- `src/renderer/src/components/AppToolbar.vue`
- `src/renderer/src/components/LevelMeter.vue`
- `src/renderer/src/components/SidecarErrorDialog.vue`
- `src/renderer/src/components/TranscriptPanel.vue`
- `src/renderer/src/components/WaveformPanel.vue`

### src/renderer/src/stores/
- `src/renderer/src/stores/annotation.ts`
- `src/renderer/src/stores/model.ts`
- `src/renderer/src/stores/playback.ts`
- `src/renderer/src/stores/recording.ts`
- `src/renderer/src/stores/session.ts`
- `src/renderer/src/stores/sidecar.ts`
- `src/renderer/src/stores/theme.ts`
- `src/renderer/src/stores/transcript.ts`

### src/renderer/src/views/
- `src/renderer/src/views/AppShellView.vue`
- `src/renderer/src/views/OnboardingView.vue`
- `src/renderer/src/views/SessionListView.vue`
