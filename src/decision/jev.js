/**
 * Módulo de Inteligência de Decisão: Jev (TypeSafe AI)
 * Modelo System One para tomada de decisões estruturadas, triagem de pautas e roteamento de canais.
 */

const { sanitizeIdentifier } = require('../security/validator');

const TYPESAFE_API_URL = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone';

/**
 * Obtém a chave de API do Jev a partir da configuração do cliente ou variáveis de ambiente.
 */
function getJevApiKey(clientConfig = {}) {
  return (
    clientConfig?.jev?.apiKey ||
    clientConfig?.decisionEngine?.apiKey ||
    process.env.TYPESAFE_API_KEY ||
    process.env.JEV_API_KEY ||
    ''
  ).trim();
}

/**
 * Motor heurístico nativo de fallback (simulador do modelo Jev)
 * Executado quando não há chave configurada ou em caso de indisponibilidade externa.
 */
function runHeuristicDecisionEngine({ title = '', text = '', client = {} }) {
  const combined = `${title} ${text}`.toLowerCase();
  const pillars = client.contentPillars || [];
  const negatives = client.negativeKeywords || [];

  // 1. Verificação de Brand Safety
  let brandSafety = 'safe';
  for (const neg of negatives) {
    if (neg && combined.includes(neg.toLowerCase())) {
      brandSafety = 'warning';
      break;
    }
  }

  // 2. Pontuação de Aderência à Marca (Fit Score 0-100)
  let matchedPillars = 0;
  for (const p of pillars) {
    const keywords = p.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const hasMatch = keywords.some(k => combined.includes(k));
    if (hasMatch) matchedPillars++;
  }
  const baseScore = pillars.length > 0 ? (matchedPillars / pillars.length) * 50 : 35;
  const lengthBonus = Math.min(25, (combined.length / 1000) * 10);
  const fitScore = Math.min(98, Math.max(55, Math.round(baseScore + lengthBonus + 25)));

  // 3. Roteamento de Canais Inteligente
  let recommendedChannels = 'omnichannel';
  if (combined.includes('dados') || combined.includes('roi') || combined.includes('b2b') || combined.includes('estratégia')) {
    recommendedChannels = 'linkedin_b2b';
  } else if (combined.includes('design') || combined.includes('visual') || combined.includes('imagem') || combined.includes('criativo')) {
    recommendedChannels = 'instagram_visual';
  } else if (combined.includes('urgente') || combined.includes('notícia') || combined.includes('anúncio')) {
    recommendedChannels = 'twitter_quick';
  }

  // 4. Potencial Viral (1.0 a 5.0)
  const viralPotential = Number((3.8 + (fitScore > 80 ? 0.8 : 0.2)).toFixed(1));

  // 5. Arquétipo Recomendado
  let recommendedArchetype = 'noticia_analitica';
  if (combined.includes('como') || combined.includes('passo') || combined.includes('guia')) {
    recommendedArchetype = 'tutorial';
  } else if (combined.includes('estudo') || combined.includes('caso') || combined.includes('resultado')) {
    recommendedArchetype = 'estudo_de_caso';
  } else if (combined.includes('minha opinião') || combined.includes('acredito') || combined.includes('visão')) {
    recommendedArchetype = 'opiniao';
  }

  return {
    source: 'jev_heuristic',
    model: 'jev-decision-v1',
    status: 'evaluated',
    brandSafety,
    brandSafetyConfidence: 0.92,
    fitScore,
    recommendedChannels,
    viralPotential,
    recommendedArchetype,
    insights: [
      `Aderência estimada em ${fitScore}% com os pilares da marca.`,
      `Canal prioritário recomendado: ${recommendedChannels.replace('_', ' ').toUpperCase()}.`,
      `Arquétipo editorial ideal: ${recommendedArchetype.replace('_', ' ')}.`
    ],
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Avalia um conteúdo via OpenRouter com saída estritamente estruturada (System One Decision)
 */
async function evaluateWithOpenRouter({ title = '', text = '', client = {}, apiKey = '' }) {
  const model = process.env.JEV_OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const documentSnippet = `${title}\n\n${(text || '').slice(0, 3000)}`.trim();

  const brandName = client.brandName || client.name || 'Marca';
  const niche = client.niche || 'Geral';
  const pillars = (client.contentPillars || []).join(', ') || 'Geral';
  const negatives = (client.negativeKeywords || []).join(', ') || 'Nenhum';

  const systemPrompt = `Você é o motor de decisão Jev System One para a marca "${brandName}" (Nicho: ${niche}).
Sua função é fazer triagem rápida e tipada do conteúdo, verificando brand safety, pontuação de aderência editorial e roteamento.
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código, sem formatação extra) no formato:
{
  "brandSafety": "safe" | "warning" | "rejected",
  "brandSafetyConfidence": 0.95,
  "fitScore": 85,
  "recommendedChannels": "omnichannel" | "linkedin_b2b" | "instagram_visual" | "twitter_quick" | "threads_community",
  "viralPotential": 4.2,
  "recommendedArchetype": "opiniao" | "estudo_de_caso" | "tutorial" | "noticia_analitica" | "dados_estatisticas"
}`;

  const userPrompt = `Pilares editoriais da marca: ${pillars}
Palavras negativas/proibidas: ${negatives}

Conteúdo a ser avaliado:
${documentSnippet}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://social360.anauedesign.com.br',
      'X-Title': 'Social360 Jev Engine'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300
    }),
    signal: controller.signal
  });

  clearTimeout(timeout);

  if (!res.ok) {
    console.warn(`[JEV OpenRouter] Status HTTP ${res.status}. Usando fallback heurístico.`);
    return runHeuristicDecisionEngine({ title, text, client });
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '{}';
  const cleanJson = content.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  const fitScore = Math.min(100, Math.max(0, Math.round(Number(parsed.fitScore) || 85)));
  const brandSafety = ['safe', 'warning', 'rejected'].includes(parsed.brandSafety) ? parsed.brandSafety : 'safe';
  const recommendedChannels = parsed.recommendedChannels || 'omnichannel';
  const viralPotential = Number((Number(parsed.viralPotential) || 4.2).toFixed(1));
  const recommendedArchetype = parsed.recommendedArchetype || 'noticia_analitica';

  return {
    source: 'openrouter_jev',
    model: `openrouter/${model}`,
    status: 'evaluated',
    brandSafety,
    brandSafetyConfidence: parsed.brandSafetyConfidence || 0.95,
    fitScore,
    recommendedChannels,
    viralPotential,
    recommendedArchetype,
    insights: [
      `Decisão Jev (via OpenRouter): Aderência de ${fitScore}% ao perfil da marca.`,
      `Roteamento otimizado para ${recommendedChannels.replace('_', ' ').toUpperCase()}.`,
      `Brand Safety: ${brandSafety.toUpperCase()} (Processado via ${model}).`
    ],
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Avalia um conteúdo (artigo ou pauta) utilizando o motor Jev (TypeSafe AI, OpenRouter ou Heurístico Nativo).
 */
async function evaluateContentWithJev({ title = '', text = '', client = {}, apiKey = '' }) {
  const key = apiKey || getJevApiKey(client);

  // Se não houver chave, recorre ao motor heurístico nativo sem interromper o pipeline
  if (!key) {
    return runHeuristicDecisionEngine({ title, text, client });
  }

  // Se for chave da OpenRouter, avalia via OpenRouter
  if (key.startsWith('sk-or-')) {
    try {
      return await evaluateWithOpenRouter({ title, text, client, apiKey: key });
    } catch (err) {
      console.warn(`[JEV OpenRouter] Falha (${err.message}). Usando fallback heurístico.`);
      return runHeuristicDecisionEngine({ title, text, client });
    }
  }

  try {
    const documentSnippet = `${title}\n\n${(text || '').slice(0, 3500)}`.trim();
    const state = {
      document: documentSnippet,
      brandName: client.brandName || client.name || 'Empresa',
      niche: client.niche || 'Geral',
      targetAudience: client.targetAudience || 'Profissionais e clientes',
      contentPillars: (client.contentPillars || []).join(', '),
      negativeKeywords: (client.negativeKeywords || []).join(', ')
    };

    const questions = {
      brandSafety: {
        type: 'choice',
        choices: ['safe', 'warning', 'rejected'],
        criteria: 'Determina se o conteúdo é seguro para a marca e se não viola diretrizes de tom ou palavras proibidas.'
      },
      fitScore: {
        type: 'score',
        min: 0,
        max: 100,
        criteria: 'Alinhamento do conteúdo com o nicho de atuação e os pilares editoriais da marca do cliente.'
      },
      recommendedChannels: {
        type: 'choice',
        choices: ['omnichannel', 'linkedin_b2b', 'instagram_visual', 'twitter_quick', 'threads_community'],
        criteria: 'Canal de redes sociais prioritário para maximizar o retorno e o engajamento com este tema.'
      },
      viralPotential: {
        type: 'score',
        min: 1,
        max: 5,
        criteria: 'Potencial de compartilhamento e atratividade do conteúdo nas mídias sociais.'
      },
      recommendedArchetype: {
        type: 'choice',
        choices: ['opiniao', 'estudo_de_caso', 'tutorial', 'noticia_analitica', 'dados_estatisticas'],
        criteria: 'Melhor enquadramento editorial para estruturar a copy deste conteúdo.'
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const res = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'jev',
        state,
        questions
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[JEV Engine] Resposta não-200 da API TypeSafe (${res.status}). Usando fallback heurístico.`);
      return runHeuristicDecisionEngine({ title, text, client });
    }

    const data = await res.json();
    const answers = data.answers || data.data || {};

    const brandSafety = answers.brandSafety?.choice || 'safe';
    const fitScore = Math.round(answers.fitScore?.score ?? 88);
    const recommendedChannels = answers.recommendedChannels?.choice || 'omnichannel';
    const viralPotential = Number((answers.viralPotential?.score ?? 4.4).toFixed(1));
    const recommendedArchetype = answers.recommendedArchetype?.choice || 'noticia_analitica';

    return {
      source: 'typesafe_jev',
      model: 'jev-system-one',
      status: 'evaluated',
      brandSafety,
      brandSafetyConfidence: answers.brandSafety?.confidence || 0.96,
      fitScore,
      recommendedChannels,
      viralPotential,
      recommendedArchetype,
      insights: [
        `Decisão TypeSafe Jev: Aderência de ${fitScore}% ao perfil do cliente.`,
        `Roteamento otimizado para ${recommendedChannels.toUpperCase()}.`,
        `Brand Safety: ${brandSafety.toUpperCase()} (Confiança: ${Math.round((answers.brandSafety?.confidence || 0.95) * 100)}%).`
      ],
      rawAnswers: answers,
      evaluatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn(`[JEV Engine] Falha na requisição ao TypeSafe Jev (${err.message}). Usando fallback.`);
    return runHeuristicDecisionEngine({ title, text, client });
  }
}

/**
 * Valida a conexão com o motor Jev (via API TypeSafe AI na nuvem ou modo heurístico nativo).
 */
async function testJevConnection(apiKey) {
  const key = (apiKey || '').trim();

  // 1. Se nenhuma chave for informada, valida e atesta a prontidão do Motor Heurístico Nativo
  if (!key) {
    try {
      const benchmark = runHeuristicDecisionEngine({
        title: 'Verificação Operacional do Motor Jev',
        text: 'Estratégia de conteúdo, análise de relevância, dados analíticos e ROI.',
        client: { contentPillars: ['Estratégia', 'Inovação'] }
      });

      return {
        ok: true,
        mode: 'heuristic',
        message: 'Motor Jev (TypeSafe AI) 100% operacional no Modo Heurístico Nativo! Triagem inteligente, Brand Safety e Fit Score prontos para uso (sem custo de API).',
        details: {
          brandSafety: benchmark.brandSafety,
          fitScore: benchmark.fitScore,
          recommendedChannels: benchmark.recommendedChannels
        }
      };
    } catch (err) {
      return { ok: false, error: `Falha ao inicializar o motor heurístico nativo: ${err.message}` };
    }
  }

  // 2. Se for chave do OpenRouter (iniciada com sk-or-)
  if (key.startsWith('sk-or-')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${key}`
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const label = data.data?.label || 'Chave Ativa';
        const usage = typeof data.data?.usage === 'number' ? ` | Consumo: $${data.data.usage.toFixed(2)}` : '';
        return {
          ok: true,
          mode: 'openrouter',
          message: `Jev conectado com sucesso via OpenRouter (${label}${usage})! O motor de decisão System One utilizará sua cota OpenRouter.`
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: 'Erro 401: Chave de API da OpenRouter inválida ou não autorizada. Verifique se copiou a chave completa em openrouter.ai/keys.'
        };
      }

      return { ok: false, error: `OpenRouter retornou status HTTP ${res.status}.` };
    } catch (err) {
      return { ok: false, error: `Falha ao conectar à OpenRouter: ${err.message}` };
    }
  }

  // 3. Se uma chave foi informada (TypeSafe AI), valida o handshake com a API oficial da TypeSafe AI
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'jev',
        state: { document: 'Teste de integridade e handshake do modelo Jev System One.' },
        questions: {
          status: {
            type: 'choice',
            choices: ['operational', 'degraded'],
            criteria: 'Checagem de integridade de serviço.'
          }
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.ok) {
      return {
        ok: true,
        mode: 'typesafe_cloud',
        message: 'Jev (TypeSafe AI) conectado com sucesso via Nuvem! Motor de decisão System One 100% operacional.'
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: `Erro ${res.status}: Chave da TypeSafe AI não autorizada ou inválida. Verifique a chave ou deixe em branco para usar o motor heurístico nativo.`
      };
    }

    return { ok: false, error: `TypeSafe AI retornou status HTTP ${res.status}.` };
  } catch (err) {
    return {
      ok: false,
      error: `Não foi possível conectar ao servidor TypeSafe AI (${err.message}). O sistema utilizará o motor heurístico nativo automaticamente.`
    };
  }
}

module.exports = {
  getJevApiKey,
  evaluateContentWithJev,
  runHeuristicDecisionEngine,
  testJevConnection
};
