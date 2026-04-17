---
status: verifying
trigger: "Debug the issue: transcription fails with Live chunk processing warning from ffmpeg conversion (matroska/webm low score, EBML header parsing failed, invalid data)."
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T20:56:11Z
---

## Current Focus

hypothesis: buffering early MediaRecorder chunks until liveSessionId exists preserves EBML header chunk and prevents ffmpeg EBML parse failures in live path
test: confirm ondataavailable no longer drops pre-session chunks; run targeted live integration tests and sanity typecheck
expecting: first uploaded live batch includes initial chunks once session is ready; backend no longer sees persistent headerless chunk stream
next_action: finalize verification notes and request/return human verification steps

## Symptoms

expected: live chunk transcription should process incoming chunks successfully
actual: ffmpeg conversion warns/fails on chunk input; transcription fails
errors: "Format matroska,webm detected only with low score ... EBML header parsing failed ... Invalid data found when processing input"
reproduction: trigger live transcription/chunk processing path with current implementation
started: unknown

## Eliminated

## Evidence
- mandatory context files read; phase undetermined and state repaired
- recent commits include `fix(live): preserve webm header in bounded decode windows (8986f05)`
- no debug knowledge base file exists
- AppShell starts live session only after recordingState becomes recording (watcher), while recorder starts immediately
- recording.ts ondataavailable currently returns early when !liveSessionId, dropping live chunk upload for those events
- transcript.ts pushLiveChunk returns true on 200 responses even if backend soft-warning produced no words, which can suppress fallback recovery when chunks were accepted but unusable
- recording.ts diff removes early return on missing liveSessionId in ondataavailable
- sidecar live integration tests for EBML/decode paths pass (3 passed)
- npm typecheck currently fails due existing AppStatusBar fields (liveUploadInFlight/liveBufferedMs/liveBufferedBytes) not present on recording store; unrelated to this one-line fix

## Resolution

root_cause: Renderer timing drops the initial MediaRecorder WebM/EBML header chunk before liveSessionId exists, so first uploaded chunks are headerless and ffmpeg cannot parse them reliably.

fix: "Removed pre-session drop guard in recorder ondataavailable so live chunks are buffered immediately and flushed when liveSessionId becomes available."
verification: "Static path verification + sidecar EBML integration tests passing; requires manual end-to-end recording run to confirm warning disappears and live transcript updates."
files_changed: ["src/renderer/src/stores/recording.ts"]
