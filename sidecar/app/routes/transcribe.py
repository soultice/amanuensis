import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Form, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import app.state as state
from app.services.live_transcription import (
    LiveSessionNotFound,
    LiveSequenceError,
    LiveTransitionError,
    resolve_live_speed_mode,
)
from app.services.transcription import (
    describe_runtime_provider,
    transcribe_file,
    warm_model_for_live,
)

router = APIRouter(prefix='/transcribe')

# Ensure only one batch transcription runs at a time (large model; concurrent = OOM)
_transcribe_lock = asyncio.Lock()


class LiveStartRequest(BaseModel):
    sampleRate: int
    channels: int
    mimeType: str
    sessionHint: str | None = None


class LivePrepareRequest(BaseModel):
    sampleRate: int
    channels: int
    pcmEncoding: str
    packetSamples: int
    archiveMimeType: str | None = None


class LiveSessionControlRequest(BaseModel):
    sessionId: str
    atMs: int


@router.get('/status')
async def get_transcription_status():
    """Poll this endpoint while batch transcription is running."""
    return JSONResponse(state.transcription_status)


@router.post('')
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Accept WebM audio file, transcribe with the local Parakeet ONNX model.

    Returns: {"words": [...], "segments": [...], "language": str, "duration": float}

    - 503: model not ready
    - 409: transcription already in progress
    """
    if state.model_manager is None or state.model_manager.state != 'present':
        raise HTTPException(status_code=503, detail='ASR model not ready')

    if _transcribe_lock.locked():
        raise HTTPException(status_code=409, detail='Transcription already in progress')

    async with _transcribe_lock:
        state.transcription_status = {'state': 'running', 'progress': 0, 'error': None}

        tmp_path: Path | None = None
        try:
            content = await audio.read()
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
                tmp.write(content)
                tmp_path = Path(tmp.name)

            loop = asyncio.get_event_loop()
            model_dir = state.model_manager.get_model_path()
            result = await loop.run_in_executor(
                None, transcribe_file, model_dir, tmp_path, state.transcription_device
            )

            state.transcription_status = {'state': 'complete', 'progress': 100, 'error': None}
            return JSONResponse(result)

        except HTTPException:
            raise
        except Exception as exc:
            state.transcription_status = {
                'state': 'error',
                'progress': 0,
                'error': str(exc),
            }
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        finally:
            if tmp_path and tmp_path.exists():
                tmp_path.unlink(missing_ok=True)


@router.post('/live/prepare')
async def live_prepare(req: LivePrepareRequest):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')

    result = await state.live_transcription_manager.prepare_session(
        sample_rate=req.sampleRate,
        channels=req.channels,
        mime_type=req.archiveMimeType or req.pcmEncoding,
    )
    result.update(
        {
            'state': 'prepared',
            'inputSocketPath': '/transcribe/live/input',
            'outputSocketPath': '/transcribe/live/output',
        }
    )
    result.setdefault('speedMode', resolve_live_speed_mode())

    warnings: list[str] = []
    if result.get('warning'):
        warnings.append(str(result['warning']))

    runtime = describe_runtime_provider(state.transcription_device)
    runtime_warning = runtime.pop('runtimeWarning', None)
    if runtime_warning:
        warnings.append(str(runtime_warning))
    result.update(runtime)

    if warnings:
        result['warning'] = ' | '.join(warnings)

    return JSONResponse(result)


@router.post('/live/start')
async def live_start(req: LiveStartRequest):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')
    result = await state.live_transcription_manager.start_session(
        sample_rate=req.sampleRate,
        channels=req.channels,
        mime_type=req.mimeType,
    )
    result.setdefault('speedMode', resolve_live_speed_mode())

    warnings: list[str] = []
    if result.get('warning'):
        warnings.append(str(result['warning']))

    try:
        if state.model_manager is not None and state.model_manager.state == 'present':
            warmup = warm_model_for_live(
                state.model_manager.get_model_path(),
                device=state.transcription_device,
            )
            defaults = result.setdefault('defaults', {})
            defaults['warmupMs'] = warmup.get('warmupMs')
    except Exception as exc:
        warnings.append(f'Live warmup warning: {exc}')

    runtime = describe_runtime_provider(state.transcription_device)
    runtime_warning = runtime.pop('runtimeWarning', None)
    if runtime_warning:
        warnings.append(str(runtime_warning))
    result.update(runtime)

    if warnings:
        result['warning'] = ' | '.join(warnings)

    return JSONResponse(result)


@router.post('/live/chunk')
async def live_chunk(
    sessionId: str = Form(...),
    seq: int = Form(...),
    chunkStartMs: int = Form(...),
    chunkEndMs: int = Form(...),
    isLast: bool = Form(False),
    audio: UploadFile = File(...),
):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')
    if state.model_manager is None or state.model_manager.state != 'present':
        raise HTTPException(status_code=503, detail='ASR model not ready')

    try:
        payload = await audio.read()
        result = await state.live_transcription_manager.ingest_chunk(
            session_id=sessionId,
            seq=seq,
            chunk_start_ms=chunkStartMs,
            chunk_end_ms=chunkEndMs,
            is_last=isLast,
            audio_bytes=payload,
            model_dir=state.model_manager.get_model_path(),
            device=state.transcription_device,
        )
        return JSONResponse(result)
    except LiveSessionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LiveTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LiveSequenceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/live/pause')
async def live_pause(req: LiveSessionControlRequest):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')
    try:
        result = await state.live_transcription_manager.pause_session(req.sessionId, req.atMs)
        return JSONResponse(result)
    except LiveSessionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LiveTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post('/live/resume')
async def live_resume(req: LiveSessionControlRequest):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')
    try:
        result = await state.live_transcription_manager.resume_session(req.sessionId, req.atMs)
        return JSONResponse(result)
    except LiveSessionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LiveTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post('/live/stop')
async def live_stop(req: LiveSessionControlRequest):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')
    try:
        result = await state.live_transcription_manager.stop_session(req.sessionId, req.atMs)
        return JSONResponse(result)
    except LiveSessionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LiveTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.websocket('/live/input')
async def live_input_socket(websocket: WebSocket):
    session_id = websocket.query_params.get('sessionId')
    if not session_id:
        await websocket.close(code=1008, reason='sessionId query parameter is required')
        return

    if state.live_transcription_manager is None:
        await websocket.close(code=1011, reason='Live transcription manager not ready')
        return

    try:
        await state.live_transcription_manager._require_session(session_id)
    except LiveSessionNotFound:
        await websocket.close(code=1008, reason=f'Live session not found: {session_id}')
        return

    await websocket.accept()
    await websocket.close(code=1000)


@router.websocket('/live/output')
async def live_output_socket(websocket: WebSocket):
    session_id = websocket.query_params.get('sessionId')
    if not session_id:
        await websocket.close(code=1008, reason='sessionId query parameter is required')
        return

    if state.live_transcription_manager is None:
        await websocket.close(code=1011, reason='Live transcription manager not ready')
        return

    try:
        session = await state.live_transcription_manager._require_session(session_id)
    except LiveSessionNotFound:
        await websocket.close(code=1008, reason=f'Live session not found: {session_id}')
        return

    await websocket.accept()
    await websocket.send_json(
        {
            'type': 'ready',
            'sessionId': session.id,
            'state': 'ready',
            'queueDepth': session.queue_depth,
            'workerBusy': session.worker_busy,
            'waitingRequests': session.waiting_requests,
        }
    )
    await websocket.close(code=1000)


@router.get('/live/status')
async def live_status(sessionId: str):
    if state.live_transcription_manager is None:
        raise HTTPException(status_code=503, detail='Live transcription manager not ready')
    try:
        result = await state.live_transcription_manager.status(sessionId)
        runtime = describe_runtime_provider(state.transcription_device)
        runtime_warning = runtime.pop('runtimeWarning', None)
        if runtime_warning and not result.get('warning'):
            result['warning'] = str(runtime_warning)
        result.update(runtime)
        return JSONResponse(result)
    except LiveSessionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
