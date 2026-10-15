/**
 * Provedor OpenAI e compatíveis (Groq, DeepSeek, OpenRouter, Mistral, LM Studio, etc.)
 */
async function callOpenAICompatible({
  systemInstructions,
  userContent,
  apiKey,
  baseUrl = 'https://api.openai.com/v1',
  model = 'gpt-4o-mini',
  providerName = 'OpenAI'
}) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/chat/completions`;

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemInstructions },
      { role: 'user', content: userContent }
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Se for OpenRouter, adicionar cabeçalhos opcionais recomendados
  if (cleanBase.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://github.com/cezaralfredo/pub_rs';
    headers['X-Title'] = 'pub_rs Omnichannel';
  }

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  // Se falhar porque o provedor não suporta response_format json_object, tenta sem ele
  if (!response.ok && response.status === 400) {
    delete payload.response_format;
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${providerName} (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`${providerName} retornou conteúdo vazio.`);
  }

  return { text, provider: providerName, model };
}

module.exports = { callOpenAICompatible };
