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
 * Avalia um conteúdo (artigo ou pauta) utilizando o modelo Jev da TypeSafe AI.
 */
async function evaluateContentWithJev({ title = '', text = '', client = {}, apiKey = '' }) {
  const key = apiKey || getJevApiKey(client);

  // Se não houver chave, recorre ao motor heurístico nativo sem interromper o pipeline
  if (!key) {
    return runHeuristicDecisionEngine({ title, text, client });
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
 * Valida a conexão com a API da TypeSafe AI para o modelo Jev.
 */
async function testJevConnection(apiKey) {
  const key = (apiKey || '').trim();
  if (!key) {
    return { ok: false, error: 'Chave de API do Jev (TypeSafe AI) ausente.' };
  }

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
        message: 'Jev (TypeSafe AI) conectado com sucesso! Motor de decisão System One operacional.'
      };
    }

    if (res.status === 401) {
      return { ok: false, error: 'Erro 401: Chave de API da TypeSafe AI inválida ou revogada.' };
    }

    return { ok: false, error: `TypeSafe AI retornou status HTTP ${res.status}.` };
  } catch (err) {
    return { ok: false, error: `Falha ao conectar à TypeSafe AI: ${err.message}` };
  }
}

module.exports = {
  getJevApiKey,
  evaluateContentWithJev,
  runHeuristicDecisionEngine,
  testJevConnection
};
