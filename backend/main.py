import json
import httpx

import numpy as np

from sentence_transformers import SentenceTransformer
from pydantic import BaseModel, Field, ValidationError
from typing import Literal
from database import (
    create_meeting_record,
    delete_meeting_record,
    get_meeting_record,
    init_db,
    list_meeting_records,
    save_meeting_analysis,
)
import time

from faster_whisper import WhisperModel
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="EchoVault Local API",
    description="Local backend for EchoVault",
    version="0.1.0",
)
init_db()

class MeetingCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    filename: str
    transcript: str = Field(min_length=1)
    language: str | None = None
    model: str | None = None
    processing_seconds: float | None = None
class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    limit: int = Field(default=5, ge=1, le=10)
class ActionItem(BaseModel):
    task: str = Field(min_length=1)
    assignee: str | None = None
    due_date: str | None = None
    priority: Literal["low", "medium", "high"] = "medium"


class MeetingAnalysis(BaseModel):
    summary: str = Field(min_length=1)
    key_decisions: list[str]
    action_items: list[ActionItem]
    topics: list[str]

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
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

embedding_model = None
OLLAMA_BASE_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL_NAME = "qwen2.5:1.5b"

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
def get_embedding_model():
    global embedding_model

    if embedding_model is None:
        print("Loading local semantic-search model...")

        embedding_model = SentenceTransformer(
            EMBEDDING_MODEL_NAME,
            device="cpu",
        )

        print("Semantic-search model loaded.")

    return embedding_model

def split_transcript_into_chunks(
    transcript: str,
    max_words: int = 120,
    overlap_words: int = 25,
) -> list[str]:
    words = transcript.split()

    if not words:
        return []

    chunks = []
    start = 0

    while start < len(words):
        end = min(start + max_words, len(words))

        chunk = " ".join(words[start:end]).strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(words):
            break

        start = end - overlap_words

    return chunks


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
@app.post("/api/meetings", status_code=201)
def create_meeting(meeting: MeetingCreate):
    if Path(meeting.filename).name != meeting.filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid recording filename",
        )

    audio_path = UPLOAD_DIR / meeting.filename

    if not audio_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Recording file not found",
        )

    return create_meeting_record(
        title=meeting.title,
        filename=meeting.filename,
        transcript=meeting.transcript,
        language=meeting.language,
        model=meeting.model,
        processing_seconds=meeting.processing_seconds,
    )


@app.get("/api/meetings")
def get_meetings():
    return list_meeting_records()


@app.get("/api/meetings/{meeting_id}")
def get_meeting(meeting_id: int):
    meeting = get_meeting_record(meeting_id)

    if meeting is None:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found",
        )

    return meeting


@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: int):
    meeting = get_meeting_record(meeting_id)

    if meeting is None:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found",
        )

    audio_path = UPLOAD_DIR / meeting["filename"]

    deleted = delete_meeting_record(meeting_id)

    if deleted and audio_path.exists():
        audio_path.unlink()

    return {
        "status": "deleted",
        "meeting_id": meeting_id,
        "audio_deleted": not audio_path.exists(),
    }

@app.post("/api/search")
def semantic_search(search_request: SearchRequest):
    query = search_request.query.strip()

    if not query:
        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty",
        )

    meetings = list_meeting_records()

    if not meetings:
        return {
            "query": query,
            "model": EMBEDDING_MODEL_NAME,
            "processing": "on-device",
            "results": [],
        }

    searchable_chunks = []

    for meeting in meetings:
        transcript = meeting.get("transcript", "").strip()

        if not transcript:
            continue

        chunks = split_transcript_into_chunks(transcript)

        for chunk_index, chunk_text in enumerate(chunks):
            searchable_chunks.append(
                {
                    "meeting_id": meeting["id"],
                    "meeting_title": meeting["title"],
                    "meeting_date": meeting["created_at"],
                    "chunk_index": chunk_index,
                    "text": chunk_text,
                }
            )

    if not searchable_chunks:
        return {
            "query": query,
            "model": EMBEDDING_MODEL_NAME,
            "processing": "on-device",
            "results": [],
        }

    try:
        model = get_embedding_model()

        query_embedding = model.encode(
            query,
            normalize_embeddings=True,
        )

        chunk_texts = [
            chunk["text"]
            for chunk in searchable_chunks
        ]

        chunk_embeddings = model.encode(
            chunk_texts,
            normalize_embeddings=True,
        )

        similarity_scores = np.dot(
            chunk_embeddings,
            query_embedding,
        )

        ranked_indices = np.argsort(
            similarity_scores
        )[::-1]

        results = []

        for index in ranked_indices[: search_request.limit]:
            chunk = searchable_chunks[int(index)]
            score = float(similarity_scores[int(index)])

            results.append(
                {
                    "meeting_id": chunk["meeting_id"],
                    "meeting_title": chunk["meeting_title"],
                    "meeting_date": chunk["meeting_date"],
                    "relevant_text": chunk["text"],
                    "chunk_index": chunk["chunk_index"],
                    "similarity_score": round(score, 4),
                }
            )

        return {
            "query": query,
            "model": EMBEDDING_MODEL_NAME,
            "processing": "on-device",
            "searched_meetings": len(meetings),
            "searched_chunks": len(searchable_chunks),
            "results": results,
        }

    except Exception as error:
        print("Semantic search error:", error)

        raise HTTPException(
            status_code=500,
            detail=f"Local semantic search failed: {error}",
        )

@app.post("/api/meetings/{meeting_id}/analyse")
def analyse_meeting(meeting_id: int):
    meeting = get_meeting_record(meeting_id)

    if meeting is None:
        raise HTTPException(
            status_code=404,
            detail="Meeting not found",
        )

    transcript = (meeting.get("transcript") or "").strip()

    if not transcript:
        raise HTTPException(
            status_code=422,
            detail="This meeting does not have a transcript",
        )

    try:
        with httpx.Client(timeout=180.0) as client:
            # Confirm Ollama is running and the model exists locally.
            models_response = client.get(
                f"{OLLAMA_BASE_URL}/api/tags"
            )
            models_response.raise_for_status()

            installed_models = {
                model.get("name") or model.get("model")
                for model in models_response.json().get(
                    "models",
                    [],
                )
            }

            if OLLAMA_MODEL_NAME not in installed_models:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        f"Local model {OLLAMA_MODEL_NAME} is missing. "
                        f"Run: ollama pull {OLLAMA_MODEL_NAME}"
                    ),
                )

            schema = MeetingAnalysis.model_json_schema()

            prompt = f"""
Analyse the meeting transcript below.

Return only information supported by the transcript.

Rules:
- Create a concise factual summary.
- List only decisions explicitly made.
- Extract genuine action items.
- Never invent an assignee.
- Never invent a due date.
- Use null when an assignee or due date is unknown.
- Priority must be low, medium, or high.
- Identify a short list of useful meeting topics.

Required JSON schema:
{json.dumps(schema)}

Meeting title:
{meeting["title"]}

Transcript:
{transcript}
""".strip()

            started_at = time.perf_counter()

            ollama_response = client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL_NAME,
                    "system": (
                        "You are a precise meeting-analysis system. "
                        "Use only the supplied transcript and return "
                        "valid structured JSON."
                    ),
                    "prompt": prompt,
                    "stream": False,
                    "format": schema,
                    "options": {
                        "temperature": 0,
                        "num_ctx": 4096,
                    },
                    "keep_alive": "10m",
                },
            )

            ollama_response.raise_for_status()

            processing_seconds = (
                time.perf_counter() - started_at
            )

    except HTTPException:
        raise

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                "Ollama is not running. Open Ollama and try again."
            ),
        )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Local meeting analysis timed out",
        )

    except httpx.HTTPStatusError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned an error: {error}",
        )

    response_text = ollama_response.json().get(
        "response",
        "",
    )

    if not response_text:
        raise HTTPException(
            status_code=502,
            detail="Ollama returned an empty response",
        )

    try:
        analysis = MeetingAnalysis.model_validate_json(
            response_text
        )

    except ValidationError as error:
        print("Invalid Ollama response:", response_text)
        print("Validation error:", error)

        raise HTTPException(
            status_code=502,
            detail=(
                "The local model returned invalid analysis data. "
                "Please try again."
            ),
        )

    saved_meeting = save_meeting_analysis(
        meeting_id=meeting_id,
        summary=analysis.summary,
        key_decisions=analysis.key_decisions,
        action_items=[
            item.model_dump()
            for item in analysis.action_items
        ],
        topics=analysis.topics,
        analysis_model=OLLAMA_MODEL_NAME,
        analysis_seconds=round(
            processing_seconds,
            2,
        ),
    )

    return {
        "status": "analysed",
        "meeting_id": meeting_id,
        "meeting_title": meeting["title"],
        "model": OLLAMA_MODEL_NAME,
        "processing": "on-device",
        "processing_seconds": round(
            processing_seconds,
            2,
        ),
        "summary": analysis.summary,
        "key_decisions": analysis.key_decisions,
        "action_items": [
            item.model_dump()
            for item in analysis.action_items
        ],
        "topics": analysis.topics,
        "saved": saved_meeting is not None,
    }    