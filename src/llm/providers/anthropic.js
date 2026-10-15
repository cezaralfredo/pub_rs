/**
 * Provedor Anthropic Claude API
 */
async function callAnthropic({
  systemInstructions,
  userContent,
  apiKey,
  model = 'claude-3-5-sonnet-20241022'
}) {
  const url = 'https://api.anthropic.com/v1/messages';

  const payload = {
    model,
    max_tokens: 4096,
    system: systemInstructions,
    messages: [
      { role: 'user', content: userContent }
    ],
    temperature: 0.7
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic Claude (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic Claude retornou conteúdo vazio.');
  }

  return { text, provider: 'Anthropic Claude', model };
}

module.exports = { callAnthropic };
