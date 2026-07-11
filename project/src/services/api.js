const API_BASE_URL = 'http://127.0.0.1:8000'

export async function checkBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/api/health`)

  if (!response.ok) {
    throw new Error('Backend unavailable')
  }

  return response.json()
}
export async function uploadRecording(audioBlob) {
  const formData = new FormData()

  formData.append(
    'file',
    audioBlob,
    `echovault-recording-${Date.now()}.webm`
  )

  const response = await fetch(
    `${API_BASE_URL}/api/recordings/upload`,
    {
      method: 'POST',
      body: formData,
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.detail || 'Audio upload failed')
  }

  return data
}
export async function transcribeRecording(filename) {
  const response = await fetch(
    `${API_BASE_URL}/api/recordings/${encodeURIComponent(filename)}/transcribe`,
    {
      method: 'POST',
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.detail || 'Local transcription failed')
  }

  return data
}
export async function saveMeeting(meeting) {
  const response = await fetch(`${API_BASE_URL}/api/meetings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(meeting),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.detail || 'Could not save meeting')
  }

  return data
}
export async function getMeetings() {
  const response = await fetch(`${API_BASE_URL}/api/meetings`)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.detail || 'Could not load meetings')
  }

  return data
}

export async function deleteMeeting(meetingId) {
  const response = await fetch(
    `${API_BASE_URL}/api/meetings/${meetingId}`,
    {
      method: 'DELETE',
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.detail || 'Could not delete meeting')
  }

  return data
}