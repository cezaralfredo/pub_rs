/**
 * Módulo de Síntese de Conteúdo a partir dos Interesses do Cliente (Topic-to-Post)
 * Responsável pela ideação de pautas inteligentes e pela síntese estruturada
 * de temas livres ou pilares de conteúdo da marca.
 */

const { callProvider, detectAvailableProviders } = require('./llm');

const ARCHETYPES = {
  dica: {
    name: 'Dica Prática / Como Fazer',
    goal: 'Entregar um passo a passo prático e acionável que resolve um problema específico.',
    hookTone: 'Direto, educativo e com retorno imediato sobre o investimento de tempo do leitor.'
  },
  opiniao: {
    name: 'Opinião de Especialista / Tendência',
    goal: 'Trazer uma visão estratégica e autoritária sobre o futuro do mercado e posicionar a marca.',
    hookTone: 'Provocativo, analítico e direcionado para líderes e tomadores de decisão.'
  },
  mito: {
    name: 'Quebra de Mito / Paradigma',
    goal: 'Expor erros comuns ou crenças ultrapassadas que custam dinheiro ou tempo ao mercado.',
    hookTone: 'Contrário ao senso comum, surpreendente e embasado em fatos/métricas.'
  },
  case: {
    name: 'Estudo de Caso / Problema-Solução',
    goal: 'Demonstrar na prática como uma barreira complexa foi superada com metodologia e estratégia.',
    hookTone: 'Narrativo, focado em desafios reais, virada de chave e métricas de sucesso.'
  }
};

/**
 * Cria slug limpo para nomes de arquivo e diretórios.
 */
function slugify(text) {
  return (text || 'post-estrategico')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Tenta fazer o parse de JSON retornado pela LLM com tolerância a formatação.
 */
function parseLlmJson(rawText) {
  let cleaned = (rawText || '').trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Não foi possível extrair JSON válido da resposta da IA.');
  }
}

/**
 * Gera sugestões automáticas de pautas baseadas nos pilares e nicho do cliente (AI Brainstorming).
 */
async function suggestTopicIdeas(client, options = {}) {
  const brandName = client.name || client.brandName || 'Marca';
  const niche = client.niche || 'Negócios e Estratégia Digital';
  const audience = client.targetAudience || 'Profissionais e tomadores de decisão';
  const tone = client.tone || 'Especialista e estratégico';
  const pillars = Array.isArray(client.contentPillars) && client.contentPillars.length > 0
    ? client.contentPillars
    : ['Tendências de Mercado', 'Boas Práticas e Inovação', 'Estratégia e ROI'];

  const count = options.count || 4;
  const available = detectAvailableProviders();
  const preferredProvider = options.provider || client.llm?.provider || (available.length > 0 ? available[0] : null);

  // 1. Se houver provedor configurado, utiliza LLM para ideação rica
  if (preferredProvider && preferredProvider !== 'none') {
    try {
      const systemInstructions = `Você é um diretor sênior de Estratégia de Conteúdo e Social Media para marcas de alto impacto.
Sua missão é sugerir exatamente ${count} ideias magnéticas de postagens para redes sociais com alto potencial de engajamento e autoridade.

DIRETRIZES:
- As ideias devem ser contextualizadas para o nicho e público do cliente.
- Varie os arquétipos entre: "dica" (como fazer), "opiniao" (análise de tendência), "mito" (quebra de crença comum) e "case" (problema-solução).
- Crie ganchos magnéticos (hooks) que capturam a atenção nos primeiros 3 segundos.

RETORNO ESTRITAMENTE EM JSON no formato:
{
  "ideas": [
    {
      "id": "idea-1",
      "title": "Título magnético do post...",
      "topic": "Tema conciso e objetivo...",
      "pillar": "Qual pilar do cliente se conecta...",
      "archetype": "dica" | "opiniao" | "mito" | "case",
      "hook": "Gancho de abertura do post...",
      "whyItWorks": "Por que esse tema vai gerar alto engajamento..."
    }
  ]
}`;

      const userContent = `=== DADOS DO CLIENTE ===
Marca: "${brandName}"
Nicho: "${niche}"
Público-Alvo: "${audience}"
Tom de Voz: "${tone}"
Pilares de Interesse: ${JSON.stringify(pillars)}
Palavras a Evitar: ${JSON.stringify(client.negativeKeywords || [])}

Gere agora as ${count} ideias estruturadas em JSON.`;

      const result = await callProvider(
        preferredProvider,
        systemInstructions,
        userContent,
        options.model || client.llm?.model,
        client.llm?.apiKey,
        client.llm?.baseUrl
      );

      if (result && result.text) {
        const parsed = parseLlmJson(result.text);
        if (Array.isArray(parsed.ideas) && parsed.ideas.length > 0) {
          return {
            source: 'llm',
            provider: result.provider,
            model: result.model,
            ideas: parsed.ideas
          };
        }
      }
    } catch (err) {
      console.warn(`[AI Ideation Aviso] Falha ao sugerir pautas via IA (${err.message}). Utilizando gerador algorítmico dinâmico.`);
    }
  }

  // 2. Fallback Algorítmico Dinâmico baseado nos pilares cadastrados do cliente
  const archetypesList = ['dica', 'opiniao', 'mito', 'case'];
  const algorithmicIdeas = pillars.slice(0, count).map((pillar, idx) => {
    const archKey = archetypesList[idx % archetypesList.length];
    const arch = ARCHETYPES[archKey];

    const templates = {
      dica: {
        title: `3 Estratégias Práticas para Dominar ${pillar}`,
        hook: `Se a sua empresa ainda está aplicando táticas antigas em ${pillar}, este roteiro em 3 etapas vai mudar o seu jogo.`,
        why: 'Resolve uma dor técnica imediata e gera salvamentos no Instagram/LinkedIn.'
      },
      opiniao: {
        title: `Por Que ${pillar} Será o Grande Diferencial dos Próximos 2 Anos`,
        hook: `A maioria dos gestores está olhando para o lugar errado. Quando o assunto é ${pillar}, o futuro já chegou.`,
        why: 'Posiciona o cliente como visionário e gera debates qualificados nos comentários.'
      },
      mito: {
        title: `O Maior Mito Sobre ${pillar} Que o Mercado Continua Repetindo`,
        hook: `Disseram que ${pillar} era complicado e caro. Aqui está a verdade que pouca gente tem coragem de falar abertamente:`,
        why: 'Quebra padrões e estimula compartilhamentos por contestar o senso comum.'
      },
      case: {
        title: `Como Transformamos os Resultados Aplicando ${pillar} na Prática`,
        hook: `Antes, o desafio parecia insolúvel. Veja os números e o passo a passo exato que destravou o crescimento:`,
        why: 'Gera prova social e credibilidade imediata com tomadores de decisão.'
      }
    };

    const chosen = templates[archKey];

    return {
      id: `idea-algo-${idx + 1}`,
      title: chosen.title,
      topic: `${pillar} aplicado a ${niche}`,
      pillar,
      archetype: archKey,
      hook: chosen.hook,
      whyItWorks: chosen.why
    };
  });

  return {
    source: 'algorithmic',
    provider: 'Motor Nativo pub_rs',
    ideas: algorithmicIdeas
  };
}

/**
 * Transforma um tópico/interesse bruto em um pacote analítico estruturado
 * equivalente ao conteúdo extraído de um artigo rico (para abastecer imageGen e copywriter).
 */
async function synthesizeTopicContent({
  topic,
  archetype = 'dica',
  client = {},
  visualStyle,
  options = {}
}) {
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    throw new Error('É necessário informar um tópico ou interesse do cliente.');
  }

  const cleanTopic = topic.trim();
  const arch = ARCHETYPES[archetype] || ARCHETYPES.dica;
  const brandName = client.name || client.brandName || 'Marca';
  const niche = client.niche || 'Estratégia e Inovação';
  const audience = client.targetAudience || 'Profissionais e tomadores de decisão';
  const tone = client.tone || 'Especialista, tecnológico e focado em valor prático';
  const slug = slugify(cleanTopic);

  const available = detectAvailableProviders();
  const preferredProvider = options.provider || client.llm?.provider || (available.length > 0 ? available[0] : null);

  // 1. Tenta sintetizar com LLM para profundidade e sofisticação semântica
  if (preferredProvider && preferredProvider !== 'none') {
    try {
      const systemInstructions = `Você é um Estrategista-Chefe de Conteúdo e Editor Executivo.
Sua missão é pegar um TÓPICO/INTERESSE do cliente e transformá-lo em uma análise aprofundada de alto valor, completa e estruturada.

ARQUÉTIPO EDITORIAL:
- Tipo: "${arch.name}"
- Objetivo: "${arch.goal}"
- Tom do Gancho: "${arch.hookTone}"

DIRETRIZES OBRIGATÓRIAS:
1. "title": Título atraente, executivo e irresistível para tomadores de decisão.
2. "description": Lead em 2-3 frases resumindo a tese central e o ganho real do leitor.
3. "headings": Array com exatamente 3 ou 4 subtítulos estratégicos (ex: O Cenário Atual, O Ponto de Virada, Metodologia Prática, O Próximo Passo).
4. "bulletPoints": Array com 4 takeaways essenciais, práticos e mensuráveis.
5. "paragraphs": Array com 4 ou 5 parágrafos bem redigidos, sem enrolação, ricos em dados e lições do mundo real.
6. "visualPromptHint": Descrição conceitual EM INGLÊS para gerar a imagem visual da capa (NÃO inclua palavras nem textos, apenas a cena/metáfora visual moderna, elementos 3D ou fotografia corporativa).

RETORNO ESTRITAMENTE EM JSON no seguinte formato:
{
  "title": "...",
  "description": "...",
  "headings": ["...", "...", "..."],
  "bulletPoints": ["...", "...", "...", "..."],
  "paragraphs": ["...", "...", "...", "..."],
  "visualPromptHint": "Conceptual 3D scene of glowing digital network nodes connecting seamlessly..."
}`;

      const userContent = `=== TÓPICO DO POST ===
Tema: "${cleanTopic}"
Arquétipo: "${archetype}" (${arch.name})

=== PERFIL DO CLIENTE ===
Marca: "${brandName}"
Nicho: "${niche}"
Público-Alvo: "${audience}"
Tom de Voz: "${tone}"
Palavras a Evitar: ${JSON.stringify(client.negativeKeywords || [])}

Gere agora a estrutura analítica completa no formato JSON exigido.`;

      const result = await callProvider(
        preferredProvider,
        systemInstructions,
        userContent,
        options.model || client.llm?.model,
        client.llm?.apiKey,
        client.llm?.baseUrl
      );

      if (result && result.text) {
        const parsed = parseLlmJson(result.text);
        if (parsed.title && Array.isArray(parsed.paragraphs)) {
          const fullTextSnippet = parsed.paragraphs.join('\n\n');
          return {
            title: parsed.title,
            slug,
            description: parsed.description || cleanTopic,
            headings: Array.isArray(parsed.headings) ? parsed.headings : [],
            bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
            paragraphs: parsed.paragraphs,
            fullTextSnippet,
            visualPromptHint: parsed.visualPromptHint || '',
            visualStyle: visualStyle || client.visualIdentity?.style || 'dark-cinematic',
            canonicalUrl: client.brandHandle ? `https://instagram.com/${client.brandHandle.replace('@', '')}` : `https://${client.id || 'marca'}.com/insights/${slug}`,
            url: `https://${client.id || 'marca'}.com/insights/${slug}`,
            isTopicMode: true,
            archetype,
            synthesizerMeta: {
              source: 'llm',
              provider: result.provider,
              model: result.model
            }
          };
        }
      }
    } catch (err) {
      console.warn(`[Synthesizer Aviso] Falha na síntese via IA (${err.message}). Utilizando gerador algorítmico dinâmico.`);
    }
  }

  // 2. Fallback Algorítmico Estruturado
  const title = `Estratégia e Ação: ${cleanTopic}`;
  const description = `Uma análise orientada a resultados sobre como implementar ${cleanTopic} com eficiência e alto retorno no mercado atual.`;
  const headings = [
    `O Contexto Atual de ${cleanTopic}`,
    'Principais Desafios e Oportunidades',
    'Roteiro Prático de Execução',
    'Conclusão e Próximos Passos'
  ];
  const bulletPoints = [
    `Diagnóstico preciso do cenário atual em ${cleanTopic}`,
    'Adoção de dados e métricas para fundamentar cada decisão',
    'Alinhamento entre tecnologia, processos e equipe',
    'Mensuração contínua de ROI e otimização de performance'
  ];
  const paragraphs = [
    `O mercado está em constante transformação, e dominar ${cleanTopic} tornou-se uma competência indispensável para qualquer negócio que busca liderança e sustentabilidade competitiva.`,
    `A abordagem tradicional frequentemente comete o erro de focar apenas em soluções pontuais sem enxergar a esteira completa. No entanto, os resultados mais consistentes vêm da integração entre estratégia clara e execução consistente.`,
    `Para colocar isso em prática, o primeiro passo consiste em auditar os processos existentes, identificar gargalos ocultos e implementar melhorias incrementais baseadas em dados confiáveis.`,
    `Ao alinhar esses fundamentos, sua empresa não apenas supera a concorrência como estabelece um padrão de referência e excelência reconhecido pelo mercado.`
  ];

  return {
    title,
    slug,
    description,
    headings,
    bulletPoints,
    paragraphs,
    fullTextSnippet: paragraphs.join('\n\n'),
    visualPromptHint: `Conceptual modern business environment representing: ${cleanTopic}. Sophisticated high-tech composition with glowing accents.`,
    visualStyle: visualStyle || client.visualIdentity?.style || 'dark-cinematic',
    canonicalUrl: `https://${client.id || 'marca'}.com/insights/${slug}`,
    url: `https://${client.id || 'marca'}.com/insights/${slug}`,
    isTopicMode: true,
    archetype,
    synthesizerMeta: {
      source: 'algorithmic',
      provider: 'Motor Nativo pub_rs'
    }
  };
}

module.exports = {
  ARCHETYPES,
  suggestTopicIdeas,
  synthesizeTopicContent,
  slugify
};
