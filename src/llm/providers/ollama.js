/**
 * Provedor Ollama para modelos locais (LLaMA 3, Mistral, Qwen, etc.)
 */
async function callOllama({
  systemInstructions,
  userContent,
  baseUrl = 'http://localhost:11434',
  model = 'llama3'
}) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/api/chat`;

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemInstructions },
      { role: 'user', content: userContent }
    ],
    format: 'json',
    stream: false,
    options: {
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
    throw new Error(`Ollama (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.message?.content;
  if (!text) {
    throw new Error('Ollama retornou conteúdo vazio.');
  }

  return { text, provider: 'Ollama (Local)', model };
}

module.exports = { callOllama };
