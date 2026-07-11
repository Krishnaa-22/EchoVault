import time

from faster_whisper import WhisperModel
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

WHISPER_MODEL_NAME = "tiny"

whisper_model = None


def get_whisper_model():
    global whisper_model

    if whisper_model is None:
        print("Loading local Whisper model...")

        whisper_model = WhisperModel(
            WHISPER_MODEL_NAME,
            device="cpu",
            compute_type="int8",
        )

        print("Whisper model loaded.")

    return whisper_model


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
@app.post("/api/recordings/{filename}/transcribe")
def transcribe_recording(filename: str):
    # Prevent paths such as ../../private-file.txt
    if Path(filename).name != filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename",
        )

    audio_path = UPLOAD_DIR / filename

    if not audio_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Recording not found",
        )

    try:
        model = get_whisper_model()

        started_at = time.perf_counter()

        segments_generator, info = model.transcribe(
            str(audio_path),
            beam_size=1,
            vad_filter=True,
        )

        transcription_segments = []
        transcript_parts = []

        # Iterating is required because Faster-Whisper returns a generator.
        for segment in segments_generator:
            clean_text = segment.text.strip()

            if not clean_text:
                continue

            transcript_parts.append(clean_text)

            transcription_segments.append(
                {
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": clean_text,
                }
            )

        transcript = " ".join(transcript_parts).strip()
        processing_seconds = time.perf_counter() - started_at

        if not transcript:
            raise HTTPException(
                status_code=422,
                detail="No speech was detected in the recording",
            )

        return {
            "status": "transcribed",
            "filename": filename,
            "model": WHISPER_MODEL_NAME,
            "device": "cpu",
            "compute_type": "int8",
            "processing": "on-device",
            "language": info.language,
            "language_probability": round(
                info.language_probability,
                4,
            ),
            "processing_seconds": round(
                processing_seconds,
                2,
            ),
            "transcript": transcript,
            "segments": transcription_segments,
        }

    except HTTPException:
        raise

    except Exception as error:
        print("Transcription error:", error)

        raise HTTPException(
            status_code=500,
            detail=f"Local transcription failed: {error}",
        )