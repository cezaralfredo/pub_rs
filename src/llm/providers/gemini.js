/**
 * Provedor Google Gemini API
 */
async function callGemini({ systemInstructions, userContent, apiKey, model = 'gemini-2.5-flash' }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstructions }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userContent }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Gemini (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Google Gemini retornou conteúdo vazio.');
  }

  return { text, provider: 'Google Gemini', model };
}

module.exports = { callGemini };
