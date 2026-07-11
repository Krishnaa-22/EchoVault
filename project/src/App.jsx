import { useEffect, useRef, useState, useMemo } from 'react'
import './App.css'
import {
  checkBackendHealth,
  uploadRecording,
  transcribeRecording,
  saveMeeting,
  getMeetings,
  deleteMeeting,
} from './services/api'

// Mock meeting data
const mockMeetings = [
  {
    id: 1,
    title: 'Sprint-Planning_07Jul2026',
    date: '07 July 2026',
    duration: '42 min',
    summary: 'Team finalized sprint goals, assigned frontend polish, backend storage setup, and demo flow preparation.',
    keywords: ['sprint', 'roadmap', 'demo', 'backend'],
    actionItems: 4,
    deadline: '10 July 2026',
    searchTerms: ['sprint', 'planning', 'roadmap', 'demo', 'backend', 'goals', 'frontend']
  },
  {
    id: 2,
    title: 'UI-Bugs_Deadline_07Jul2026',
    date: '07 July 2026',
    duration: '28 min',
    summary: 'Discussed mobile responsiveness, search card spacing, button states, and dashboard improvements before submission.',
    keywords: ['UI bugs', 'responsive', 'frontend', 'deadline'],
    actionItems: 5,
    deadline: '08 July 2026',
    searchTerms: ['ui', 'bugs', 'responsive', 'frontend', 'mobile', 'dashboard', 'deadline']
  },
  {
    id: 3,
    title: 'Firebase-Auth_Review_06Jul2026',
    date: '06 July 2026',
    duration: '35 min',
    summary: 'Reviewed login flow, OAuth options, password reset, and security rules for user authentication.',
    keywords: ['Firebase', 'authentication', 'OAuth', 'password reset'],
    actionItems: 3,
    deadline: '09 July 2026',
    searchTerms: ['firebase', 'authentication', 'oauth', 'password', 'reset', 'login', 'security', 'auth']
  }
]

// Semantic search mapping for related terms
const semanticMap = {
  'authentication': ['login', 'oauth', 'firebase', 'password reset', 'auth', 'security', 'user'],
  'login': ['authentication', 'oauth', 'firebase', 'password', 'auth'],
  'oauth': ['authentication', 'login', 'firebase', 'security'],
  'firebase': ['authentication', 'login', 'oauth', 'password reset'],
  'password reset': ['authentication', 'login', 'firebase', 'security'],
  'ui': ['bugs', 'frontend', 'responsive', 'mobile', 'dashboard'],
  'bugs': ['ui', 'frontend', 'responsive', 'deadline'],
  'deadline': ['bugs', 'sprint', 'planning', 'submission'],
}

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <div className="navbar-logo">
            <span className="navbar-logo-icon">🎙️</span>
            <span>EchoVault</span>
          </div>
          <span className="navbar-tagline">Private AI Meeting Memory</span>
        </div>
        <div className="navbar-links">
          <a href="#record" className="navbar-link">Record</a>
          <a href="#search" className="navbar-link">Search</a>
          <a href="#meetings" className="navbar-link">Meetings</a>
          <a href="#privacy" className="navbar-link">Privacy</a>
          <button className="navbar-cta">Start Recording</button>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            100% On-Device AI
          </div>
          <h1 className="hero-title">
            Your Private AI<br />
            <span className="hero-title-accent">Meeting Memory</span>
          </h1>
          <p className="hero-subtitle">
            Record, summarize, organize, and semantically search your meetings — fully on-device.
          </p>
          <div className="hero-buttons">
            <button className="btn-primary">
              <span>🎙️</span>
              Start Local Recording
            </button>
            <button className="btn-secondary">
              <span>🔍</span>
              Search Meeting Memory
            </button>
          </div>
          <div className="hero-trust">
            <div className="trust-badge">
              <span className="trust-badge-icon">✓</span>
              Offline AI
            </div>
            <div className="trust-badge">
              <span className="trust-badge-icon">✓</span>
              No Cloud Upload
            </div>
            <div className="trust-badge">
              <span className="trust-badge-icon">✓</span>
              Smart Titles
            </div>
            <div className="trust-badge">
              <span className="trust-badge-icon">✓</span>
              Semantic Search
            </div>
          </div>
        </div>
        <div className="hero-mockup">
          <div className="mockup-header">
            <div className="mockup-status">
              <span className="mockup-status-dot"></span>
              <span className="mockup-status-text">Recording Active</span>
            </div>
            <span className="mockup-time">00:12:48</span>
          </div>
          <div className="waveform-container">
            <div className="waveform">
              {[...Array(15)].map((_, i) => (
                <div key={i} className="waveform-bar"></div>
              ))}
            </div>
          </div>
          <div className="processing-checklist">
            <div className="checklist-item">
              <span className="checklist-icon complete">✓</span>
              <span className="checklist-item-text">Audio saved locally</span>
            </div>
            <div className="checklist-item">
              <span className="checklist-icon complete">✓</span>
              <span className="checklist-item-text">Offline transcript generated</span>
            </div>
            <div className="checklist-item">
              <span className="checklist-icon complete">✓</span>
              <span className="checklist-item-text">Summary created</span>
            </div>
            <div className="checklist-item">
              <span className="checklist-icon complete">✓</span>
              <span className="checklist-item-text">Action items extracted</span>
            </div>
            <div className="checklist-item">
              <span className="checklist-icon active">●</span>
              <span className="checklist-item-text">Embeddings stored locally</span>
            </div>
          </div>
          <div className="smart-title-preview">
            <span className="smart-title-label">Smart Title:</span>
            <span className="smart-title-value">UI-Bugs_Deadline_07Jul2026</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function RecordingSection({ onMeetingSaved })  {
  const [meetingTitle, setMeetingTitle] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [status, setStatus] = useState('Ready to record')
  const [isUploading, setIsUploading] = useState(false)

  const [transcript, setTranscript] = useState('')
const [transcriptionInfo, setTranscriptionInfo] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)

  useEffect(() => {
    let timerId

    if (isRecording && !isPaused) {
      timerId = window.setInterval(() => {
        setElapsedSeconds((current) => current + 1)
      }, 1000)
    }

    return () => {
      if (timerId) {
        window.clearInterval(timerId)
      }
    }
  }, [isRecording, isPaused])

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [audioUrl])

  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${String(minutes).padStart(2, '0')}:${String(
      seconds
    ).padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      setStatus('Requesting microphone permission...')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      streamRef.current = stream
      audioChunksRef.current = []

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
        setAudioUrl('')
      }

      setAudioBlob(null)
      setElapsedSeconds(0)
      setTranscript('')
setTranscriptionInfo(null)

      const preferredMimeType = 'audio/webm;codecs=opus'

      const recorderOptions = MediaRecorder.isTypeSupported(
        preferredMimeType
      )
        ? { mimeType: preferredMimeType }
        : undefined

      const mediaRecorder = new MediaRecorder(
        stream,
        recorderOptions
      )

      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const mimeType =
          mediaRecorder.mimeType || 'audio/webm'

        const recordedBlob = new Blob(
          audioChunksRef.current,
          { type: mimeType }
        )

        const recordingUrl = URL.createObjectURL(recordedBlob)

        setAudioBlob(recordedBlob)
        setAudioUrl(recordingUrl)
        setStatus('Recording ready to save')

        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      mediaRecorder.start()

      setIsRecording(true)
      setIsPaused(false)
      setStatus('Recording locally')
    } catch (error) {
      console.error('Microphone error:', error)

      if (error.name === 'NotAllowedError') {
        setStatus('Microphone permission denied')
      } else {
        setStatus('Could not access microphone')
      }
    }
  }

  const pauseOrResumeRecording = () => {
    const recorder = mediaRecorderRef.current

    if (!recorder || !isRecording) {
      return
    }

    if (recorder.state === 'recording') {
      recorder.pause()
      setIsPaused(true)
      setStatus('Recording paused')
    } else if (recorder.state === 'paused') {
      recorder.resume()
      setIsPaused(false)
      setStatus('Recording locally')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      return
    }

    recorder.stop()

    setIsRecording(false)
    setIsPaused(false)
    setStatus('Preparing recording...')
  }

const saveRecording = async () => {
  if (!audioBlob) {
    setStatus('Record and stop audio before saving')
    return
  }

  try {
    setIsUploading(true)
    setTranscript('')
    setTranscriptionInfo(null)

    setStatus('Uploading recording to local backend...')

    const uploadResult = await uploadRecording(audioBlob)

    setStatus('Transcribing locally with Whisper...')

    const transcriptionResult = await transcribeRecording(
      uploadResult.filename
    )
    setStatus('Saving meeting locally...')

const savedMeeting = await saveMeeting({
  title:
    meetingTitle.trim() ||
    `Meeting ${new Date().toLocaleString()}`,
  filename: uploadResult.filename,
  transcript: transcriptionResult.transcript,
  language: transcriptionResult.language,
  model: transcriptionResult.model,
  processing_seconds:
    transcriptionResult.processing_seconds,
})

    setTranscript(transcriptionResult.transcript)

    setTranscriptionInfo({
      language: transcriptionResult.language,
      model: transcriptionResult.model,
      processingSeconds:
        transcriptionResult.processing_seconds,
    })

    setStatus(`Meeting saved locally — ID ${savedMeeting.id}`)
    if (onMeetingSaved) {
  onMeetingSaved()
}
  } catch (error) {
    console.error('Processing error:', error)
    setStatus(error.message || 'Meeting processing failed')
  } finally {
    setIsUploading(false)
  }
}

  return (
    <section
      id="record"
      className="section recording-section"
    >
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Record Meeting</h2>

          <p className="section-subtitle">
            Record audio through your browser and save it to the
            EchoVault backend running on your own laptop.
          </p>
        </div>

        <div className="recording-card">
        <div className="meeting-title-field">
  <label htmlFor="meeting-title">
    Meeting title
  </label>

  <input
    id="meeting-title"
    type="text"
    value={meetingTitle}
    onChange={(event) => setMeetingTitle(event.target.value)}
    placeholder="Example: EchoVault Planning Meeting"
    maxLength={120}
    disabled={isRecording || isUploading}
  />
</div>
          <div className="mic-button-container">
            <button
              className={`mic-button ${
                isRecording ? 'recording' : ''
              }`}
              aria-label={
                isRecording
                  ? 'Stop recording'
                  : 'Start recording'
              }
              onClick={
                isRecording
                  ? stopRecording
                  : startRecording
              }
            >
              {isRecording ? '⏹️' : '🎙️'}
            </button>

            <div className="mic-button-ring"></div>
          </div>

          <div className="recording-timer">
            {formatTime(elapsedSeconds)}
          </div>

          <div className="recording-status-message">
            {status}
          </div>

          <div className="recording-pills">
            <span className="recording-pill active">
              <span>●</span>
              {isRecording
                ? isPaused
                  ? 'Recording Paused'
                  : 'Recording Locally'
                : 'Browser Microphone'}
            </span>

            <span className="recording-pill info">
              <span>💻</span> Local Backend
            </span>

            <span className="recording-pill warning">
              <span>🔒</span> No Cloud AI
            </span>
          </div>

          <div className="recording-actions">
            <button
              className="recording-btn recording-btn-start"
              onClick={startRecording}
              disabled={isRecording}
            >
              Start
            </button>

            <button
              className="recording-btn recording-btn-pause"
              onClick={pauseOrResumeRecording}
              disabled={!isRecording}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              className="recording-btn recording-btn-save"
              onClick={
                isRecording
                  ? stopRecording
                  : saveRecording
              }
              disabled={isUploading}
            >
              {isRecording
                ? 'Stop'
                : isUploading
                  ? 'Saving...'
                  : 'Save Meeting'}
            </button>
          </div>

          {audioUrl && (
            <div className="recording-preview">
              <p>Recording preview</p>

              <audio
                src={audioUrl}
                controls
              />
            </div>
          )}
          {audioUrl && (
  <div className="recording-preview">
    <p>Recording preview</p>

    <audio
      src={audioUrl}
      controls
    />
  </div>
)}

{transcript && (
  <div className="transcript-result">
    <div className="transcript-result-header">
      <div>
        <span className="transcript-label">
          Local Whisper Transcript
        </span>

        <h3>Meeting Transcript</h3>
      </div>

      {transcriptionInfo && (
        <div className="transcript-meta">
          <span>
            Language: {transcriptionInfo.language}
          </span>

          <span>
            Model: {transcriptionInfo.model}
          </span>

          <span>
            Time: {transcriptionInfo.processingSeconds}s
          </span>
        </div>
      )}
    </div>

    <p className="transcript-text">
      {transcript}
    </p>

    <div className="transcript-privacy">
      Processed locally — no cloud AI used
    </div>
  </div>
)}
        </div>
      </div>
    </section>
  )
}
function MeetingHistory({ refreshKey }) {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMeetingId, setOpenMeetingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    async function loadMeetings() {
      try {
        setLoading(true)
        setError('')

        const data = await getMeetings()
        setMeetings(data)
      } catch (loadError) {
        console.error('Meeting loading error:', loadError)
        setError(loadError.message || 'Could not load meetings')
      } finally {
        setLoading(false)
      }
    }

    loadMeetings()
  }, [refreshKey])

  const handleDelete = async (meetingId) => {
    const confirmed = window.confirm(
      'Delete this meeting and its local audio recording?'
    )

    if (!confirmed) {
      return
    }

    try {
      setDeletingId(meetingId)

      await deleteMeeting(meetingId)

      setMeetings((currentMeetings) =>
        currentMeetings.filter(
          (meeting) => meeting.id !== meetingId
        )
      )

      if (openMeetingId === meetingId) {
        setOpenMeetingId(null)
      }
    } catch (deleteError) {
      console.error('Meeting deletion error:', deleteError)
      window.alert(
        deleteError.message || 'Could not delete meeting'
      )
    } finally {
      setDeletingId(null)
    }
  }

  const formatMeetingDate = (createdAt) => {
    if (!createdAt) {
      return 'Unknown date'
    }

    const normalizedDate = createdAt.includes('T')
      ? createdAt
      : `${createdAt.replace(' ', 'T')}Z`

    const date = new Date(normalizedDate)

    if (Number.isNaN(date.getTime())) {
      return createdAt
    }

    return date.toLocaleString()
  }

  return (
    <section id="meetings" className="section meeting-history-section">
      <div className="section-container">
        <div className="section-header">
          <span className="section-badge">
            Stored on your device
          </span>

          <h2 className="section-title">
            Meeting History
          </h2>

          <p className="section-subtitle">
            View transcripts saved privately in your local
            EchoVault database.
          </p>
        </div>

        {loading && (
          <div className="meeting-history-message">
            Loading local meetings...
          </div>
        )}

        {error && (
          <div className="meeting-history-message error">
            {error}
          </div>
        )}

        {!loading && !error && meetings.length === 0 && (
          <div className="meeting-empty-state">
            <h3>No saved meetings yet</h3>

            <p>
              Record and save your first meeting to see it here.
            </p>
          </div>
        )}

        {!loading && meetings.length > 0 && (
          <div className="meeting-history-grid">
            {meetings.map((meeting) => {
              const isOpen = openMeetingId === meeting.id

              return (
                <article
                  className="meeting-history-card"
                  key={meeting.id}
                >
                  <div className="meeting-history-card-header">
                    <div>
                      <span className="meeting-id">
                        Meeting #{meeting.id}
                      </span>

                      <h3>{meeting.title}</h3>
                    </div>

                    <span className="meeting-language">
                      {(meeting.language || 'unknown')
                        .toUpperCase()}
                    </span>
                  </div>

                  <div className="meeting-history-meta">
                    <span>
                      {formatMeetingDate(meeting.created_at)}
                    </span>

                    <span>
                      Whisper {meeting.model || 'unknown'}
                    </span>

                    <span>
                      {meeting.processing_seconds ?? '—'}s
                    </span>
                  </div>

                  <p
                    className={`meeting-transcript-preview ${
                      isOpen ? 'expanded' : ''
                    }`}
                  >
                    {meeting.transcript}
                  </p>

                  <div className="meeting-history-actions">
                    <button
                      type="button"
                      className="meeting-open-button"
                      onClick={() =>
                        setOpenMeetingId(
                          isOpen ? null : meeting.id
                        )
                      }
                    >
                      {isOpen
                        ? 'Close Transcript'
                        : 'Open Transcript'}
                    </button>

                    <button
                      type="button"
                      className="meeting-delete-button"
                      onClick={() =>
                        handleDelete(meeting.id)
                      }
                      disabled={deletingId === meeting.id}
                    >
                      {deletingId === meeting.id
                        ? 'Deleting...'
                        : 'Delete'}
                    </button>
                  </div>

                  <div className="meeting-local-note">
                    Stored locally in SQLite
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
const workflowSteps = [
  { icon: '🎙️', title: 'Record Meeting', desc: 'Capture audio locally on your device' },
  { icon: '🔊', title: 'Offline Speech-to-Text', desc: 'Convert audio to transcript using Whisper' },
  { icon: '📝', title: 'Transcript', desc: 'Full searchable text of your meeting' },
  { icon: '🤖', title: 'AI Summary', desc: 'Local LLM generates concise summary' },
  { icon: '✨', title: 'Smart Title', desc: 'Auto-generated descriptive meeting titles' },
  { icon: '🧠', title: 'Embedding Generation', desc: 'Create semantic vectors on-device' },
  { icon: '💾', title: 'Local Database', desc: 'All data stored privately on your device' },
  { icon: '🔍', title: 'Semantic Search', desc: 'Find meetings by meaning, not just keywords' },
]

function WorkflowSection() {
  return (
    <section className="section workflow-section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Your meeting data flows through a completely local pipeline.</p>
        </div>
        <div className="workflow-grid">
          {workflowSteps.map((step, index) => (
            <div key={index} className="workflow-card">
              <div className="workflow-icon">{step.icon}</div>
              <h3 className="workflow-card-title">{step.title}</h3>
              <p className="workflow-card-desc">{step.desc}</p>
              {index < workflowSteps.length - 1 && index % 4 !== 3 && (
                <div className="workflow-connector"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SearchSection() {
  const [searchQuery, setSearchQuery] = useState('')

  const suggestions = ['authentication', 'login', 'Firebase', 'OAuth', 'password reset', 'UI bugs', 'deadline']

  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return mockMeetings

    const query = searchQuery.toLowerCase().trim()
    const relatedTerms = semanticMap[query] || []

    return mockMeetings.filter(meeting => {
      const matchesDirect = meeting.searchTerms.some(term => term.includes(query))
      const matchesSemantic = relatedTerms.some(term =>
        meeting.searchTerms.some(mt => mt.includes(term))
      )
      return matchesDirect || matchesSemantic
    })
  }, [searchQuery])

  return (
    <section id="search" className="section search-section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Semantic Search</h2>
          <p className="section-subtitle">Search by meaning, not just keywords. Find related meetings automatically.</p>
        </div>
        <div className="search-container">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Ask: What did we decide about authentication?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="search-suggestions">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="suggestion-chip"
                onClick={() => setSearchQuery(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        <div id="meetings">
          {filteredMeetings.length > 0 ? (
            <div className="meetings-grid">
              {filteredMeetings.map(meeting => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          ) : (
            <div className="no-results">
              No meetings found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function MeetingCard({ meeting }) {
  return (
    <div className="meeting-card">
      <div className="meeting-header">
        <h3 className="meeting-title">{meeting.title}</h3>
        <span className="meeting-local-badge">
          <span>💾</span> Local
        </span>
      </div>
      <div className="meeting-meta">
        <span className="meeting-meta-item">
          <span>📅</span> {meeting.date}
        </span>
        <span className="meeting-meta-item">
          <span>⏱️</span> {meeting.duration}
        </span>
      </div>
      <p className="meeting-summary">{meeting.summary}</p>
      <div className="meeting-keywords">
        {meeting.keywords.map((keyword, index) => (
          <span key={index} className="keyword-chip">{keyword}</span>
        ))}
      </div>
      <div className="meeting-footer">
        <span className="meeting-actions-count">
          <span>📋</span> {meeting.actionItems} action items
        </span>
        <span className="meeting-deadline">
          <span>⏰</span> {meeting.deadline}
        </span>
      </div>
    </div>
  )
}

function PrivacySection() {
  const privacyFeatures = [
    { icon: '💾', title: 'Local Audio Storage', desc: 'All recordings stay on your device' },
    { icon: '🔊', title: 'Offline Transcription', desc: 'Whisper runs 100% locally' },
    { icon: '🤖', title: 'Local AI Summaries', desc: 'No cloud API calls needed' },
    { icon: '🧠', title: 'Local Embeddings', desc: 'Semantic vectors never leave device' },
    { icon: '👤', title: 'Full User Ownership', desc: 'You control all your data' },
    { icon: '📴', title: 'Works Without Internet', desc: 'Full functionality offline' },
  ]

  return (
    <section id="privacy" className="section privacy-section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Your meetings never leave your device</h2>
          <p className="section-subtitle">Complete privacy by design. No servers, no uploads, no compromises.</p>
        </div>
        <div className="privacy-grid">
          {privacyFeatures.map((feature, index) => (
            <div key={index} className="privacy-card">
              <div className="privacy-icon">{feature.icon}</div>
              <h3 className="privacy-card-title">{feature.title}</h3>
              <p className="privacy-card-desc">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function UsersSection() {
  const userTypes = [
    { icon: '🎓', label: 'Students' },
    { icon: '💻', label: 'Software Teams' },
    { icon: '🚀', label: 'Startups' },
    { icon: '🏢', label: 'Businesses' },
    { icon: '🔬', label: 'Researchers' },
    { icon: '📚', label: 'Teachers' },
    { icon: '💼', label: 'Freelancers' },
    { icon: '🎯', label: 'Interviewers' },
  ]

  return (
    <section className="section users-section">
      <div className="section-container">
        <div className="section-header">
          <h2 className="section-title">Built For Everyone</h2>
          <p className="section-subtitle">From solo developers to enterprise teams.</p>
        </div>
        <div className="users-chips">
          {userTypes.map((type, index) => (
            <div key={index} className="user-chip">
              <span className="user-chip-icon">{type.icon}</span>
              {type.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="final-cta">
      <h2 className="final-cta-title">Turn every meeting into searchable memory.</h2>
      <p className="final-cta-subtitle">Private. Offline. Intelligent.</p>
      <button className="final-cta-btn">Try EchoVault Demo</button>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <p className="footer-text">EchoVault — Private On-Device AI Meeting Memory</p>
    </footer>
  )
}

function App() {
    const [backendStatus, setBackendStatus] = useState('checking')
    const [meetingsRefreshKey, setMeetingsRefreshKey] = useState(0)
  useEffect(() => {
    async function connectBackend() {
      try {
        const data = await checkBackendHealth()

        if (data.status === 'running') {
          setBackendStatus('connected')
        } else {
          setBackendStatus('offline')
        }
      } catch (error) {
        console.error(error)
        setBackendStatus('offline')
      }
    }

    connectBackend()
  }, [])  
  const refreshMeetingHistory = () => {
  setMeetingsRefreshKey((current) => current + 1)
}
  return (
    <>
      <Navbar />
      <div className={`backend-status ${backendStatus}`}>
  <span className="backend-dot"></span>

  {backendStatus === 'checking' && 'Local Engine: Checking'}
  {backendStatus === 'connected' && 'Local Engine: Connected'}
  {backendStatus === 'offline' && 'Local Engine: Offline'}
</div>
      <Hero />
      <RecordingSection
  onMeetingSaved={refreshMeetingHistory}
/>

<MeetingHistory
  refreshKey={meetingsRefreshKey}
/>
      <WorkflowSection />
      <SearchSection />
      <PrivacySection />
      <UsersSection />
      <FinalCTA />
      <Footer />
    </>
  )
}

export default App
