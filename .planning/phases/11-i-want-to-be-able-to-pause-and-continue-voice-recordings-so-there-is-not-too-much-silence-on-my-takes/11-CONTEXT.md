# Phase 11: Pause & Resume Recordings — Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Add pause/resume capability to the recording flow. The user can pause mid-recording (e.g., to gather thoughts or step away), then resume. Silence during pause is naturally excluded from the audio file because `MediaRecorder.pause()` suspends data capture. The resulting WebM blob is seamless — no special merging or post-processing needed. Transcription is unaware any pause occurred.

### What changes
- `RecordingState` gains a `'paused'` value: `'idle' | 'recording' | 'paused' | 'stopped'`
- `useRecordingStore` gains `pauseRecording()` and `resumeRecording()` actions
- `durationMs` excludes pause time (track cumulative pause duration)
- Toolbar record button cycles: Record → Pause → Resume (same button position, label changes)
- Level meter freezes (zeroes) while paused
- Stop button remains available during both `recording` and `paused` states

### What does NOT change
- Transcription pipeline — the WebM blob looks identical, no silence gaps
- Session persistence — no new fields needed
- Waveform / transcript / annotation logic — unaffected
- Audio chunk collection — `_chunks` already accumulates only captured (non-paused) data
</domain>

<decisions>
## Implementation Decisions

### D-01: MediaRecorder.pause() / .resume() — no custom merging needed
`MediaRecorder.pause()` suspends data capture. The stream continues but chunks are not emitted. On `.resume()`, capture continues into the same `_chunks` array. The final `Blob` assembled in `onstop` is silence-free. No FFmpeg or WebAudio merging required.

### D-02: durationMs accounting
Track `_pausedMs: number` (total ms spent in paused state) and `_pauseStart: number` (timestamp when most recent pause began). On stop: `durationMs = Date.now() - _startTime - _pausedMs`. Update `_pausedMs` in `resumeRecording()`.

### D-03: Single toggle button
The existing record button (shown when `idle`) becomes a multi-state toggle:
- `idle` → shows "Record" (orange/current style)
- `recording` → shows "Pause" (same position, amber/yellow tint)
- `paused` → shows "Resume" (same position, green tint)
Stop button (■ Stop) shown whenever state is `recording` OR `paused`.

### D-04: Level meter freeze
`LevelMeter` receives `:active="recordingStore.isRecording"`. Since `isRecording` is a getter returning `state === 'recording'`, it already returns false when paused — level meter bars freeze automatically at whatever value they had. No extra change needed; just verify the getter is updated to NOT include 'paused'.

### D-05: No UI-SPEC needed
This is a minimal single-button state change, not a new screen or complex layout. Inline style decisions (amber for Pause, green for Resume) are at executor discretion within the existing Solarized palette.
</decisions>

---

*Phase: 11-pause-resume*
*Context gathered: 2026-04-14*
