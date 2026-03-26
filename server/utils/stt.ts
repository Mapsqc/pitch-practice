import OpenAI, { toFile } from 'openai'

export async function transcribeAudio(apiKey: string, pcmBuffer: Buffer): Promise<string> {
  const openai = new OpenAI({ apiKey })

  // Convert raw PCM 16-bit 16kHz mono to WAV format for Whisper
  const wavBuffer = pcmToWav(pcmBuffer, 16000, 1, 16)

  const file = await toFile(wavBuffer, 'audio.wav', { type: 'audio/wav' })

  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'fr',
    response_format: 'text',
  })

  return (response as unknown as string).trim()
}

function pcmToWav(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = pcmData.length
  const headerSize = 44
  const buffer = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt chunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  pcmData.copy(buffer, 44)

  return buffer
}
