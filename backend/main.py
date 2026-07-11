from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="EchoVault Local API",
    description="Local backend for EchoVault",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "EchoVault Local API is running"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "running",
        "service": "EchoVault Local API",
        "processing": "on-device",
        "database_ready": False,
        "whisper_ready": False,
        "embedding_model_ready": False,
        "local_llm_ready": False,
    }
from pathlib import Path
from uuid import uuid4

from fastapi import File, HTTPException, UploadFile

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".webm", ".wav", ".mp3", ".m4a", ".ogg"}


@app.post("/api/recordings/upload")
async def upload_recording(file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format",
        )

    safe_filename = f"{uuid4()}{extension}"
    destination = UPLOAD_DIR / safe_filename

    contents = await file.read()

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio file is empty",
        )

    destination.write_bytes(contents)

    return {
        "status": "uploaded",
        "filename": safe_filename,
        "original_filename": file.filename,
        "size_bytes": len(contents),
        "processing": "stored locally",
    }