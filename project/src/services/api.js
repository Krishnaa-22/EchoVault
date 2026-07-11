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