# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for the Amanuensis sidecar
# Build with: pyinstaller amanuensis-sidecar.spec --distpath ../dist-sidecar --workpath ../build-sidecar --clean

import importlib.util as _ilu

def importlib_path(pkg):
    spec = _ilu.find_spec(pkg)
    return spec.submodule_search_locations[0] if spec and spec.submodule_search_locations else ''

block_cipher = None

_ct2_path = importlib_path('ctranslate2')

a = Analysis(
    ['app/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        (_ct2_path, 'ctranslate2'),
    ] if _ct2_path else [],
    hiddenimports=[
        # uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # faster-whisper and ctranslate2
        'faster_whisper',
        'faster_whisper.transcribe',
        'faster_whisper.audio',
        'faster_whisper.feature_extractor',
        'faster_whisper.tokenizer',
        'faster_whisper.vad',
        'ctranslate2',
        'ctranslate2.specs',
        'ctranslate2.converters',
        # huggingface_hub
        'huggingface_hub',
        'huggingface_hub.utils',
        'huggingface_hub.utils._cache_manager',
        'huggingface_hub.utils._headers',
        # tokenizers (Rust extension)
        'tokenizers',
        'tokenizers.models',
        'tokenizers.pre_tokenizers',
        'tokenizers.decoders',
        'tokenizers.processors',
        'tokenizers.normalizers',
        # av (PyAV — audio decoding)
        'av',
        'av.audio',
        'av.audio.stream',
        'av.audio.frame',
        'av.audio.resampler',
        'av.container',
        'av.codec',
        # anyio
        'anyio',
        'anyio._backends._asyncio',
        'anyio._backends._trio',
        # starlette
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.responses',
        'starlette.requests',
        'starlette.background',
        # fastapi
        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        # multipart
        'multipart',
        # numpy
        'numpy',
        'numpy.core',
        'numpy.core._multiarray_umath',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='amanuensis-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='amanuensis-sidecar',
)
