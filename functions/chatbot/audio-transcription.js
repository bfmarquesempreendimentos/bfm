const axios = require('axios');
const FormData = require('form-data');

/**
 * Extensão de arquivo aceita pelo Whisper (OpenAI) a partir do MIME.
 */
function mimeToWhisperFilename(mimeType) {
  var m = (mimeType || '').toLowerCase().split(';')[0].trim();
  if (m.indexOf('audio/ogg') === 0 || m.indexOf('audio/opus') === 0) return { filename: 'audio.ogg', contentType: m || 'audio/ogg' };
  if (m.indexOf('audio/mpeg') === 0 || m.indexOf('audio/mp3') === 0) return { filename: 'audio.mp3', contentType: m || 'audio/mpeg' };
  if (m.indexOf('audio/mp4') === 0 || m.indexOf('audio/x-m4a') === 0) return { filename: 'audio.m4a', contentType: m || 'audio/mp4' };
  if (m.indexOf('audio/wav') === 0 || m.indexOf('audio/wave') === 0) return { filename: 'audio.wav', contentType: m || 'audio/wav' };
  if (m.indexOf('audio/webm') === 0) return { filename: 'audio.webm', contentType: m || 'audio/webm' };
  if (m.indexOf('audio/flac') === 0) return { filename: 'audio.flac', contentType: m || 'audio/flac' };
  if (m.indexOf('audio/') === 0) return { filename: 'audio.bin', contentType: m };
  return { filename: 'audio.ogg', contentType: 'audio/ogg' };
}

/**
 * Transcreve áudio (buffer) para texto em português via OpenAI Whisper.
 * Requer OPENAI_API_KEY no ambiente.
 * @returns {Promise<string>} texto transcrito ou string vazia em falha silenciosa de config
 */
async function transcribeAudioBuffer(buffer, mimeType) {
  var key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== 'string') {
    return '';
  }
  if (!buffer || !buffer.length) {
    return '';
  }
  var maxBytes = 24 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    console.warn('[transcribe] áudio muito grande para Whisper:', buffer.length);
    return '';
  }

  var spec = mimeToWhisperFilename(mimeType);
  var form = new FormData();
  form.append('file', buffer, {
    filename: spec.filename,
    contentType: spec.contentType || 'application/octet-stream',
  });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  var res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
    headers: {
      Authorization: 'Bearer ' + key,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 90000,
  });

  var txt = res.data && res.data.text;
  return txt ? String(txt).trim() : '';
}

module.exports = { transcribeAudioBuffer, mimeToWhisperFilename };
