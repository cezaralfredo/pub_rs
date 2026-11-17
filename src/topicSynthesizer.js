/**
 * Módulo de Síntese de Conteúdo a partir dos Interesses do Cliente (Topic-to-Post)
 * Responsável pela ideação de pautas inteligentes e pela síntese estruturada
 * com vieses editoriais avançados (Profundidade, Ângulo, E-E-A-T e Conversão).
 */

const { callProvider, detectAvailableProviders } = require('./llm');

const ARCHETYPES = {
  dica: {
    id: 'dica',
    name: 'Dica Prática / Como Fazer',
    goal: 'Entregar um passo a passo prático e acionável que resolve um problema específico.',
    hookTone: 'Direto, educativo e com retorno imediato sobre o investimento de tempo do leitor.'
  },
  opiniao: {
    id: 'opiniao',
    name: 'Opinião de Especialista / Tendência',
    goal: 'Trazer uma visão estratégica e autoritária sobre o futuro do mercado e posicionar a marca.',
    hookTone: 'Provocativo, analítico e direcionado para líderes e tomadores de decisão.'
  },
  mito: {
    id: 'mito',
    name: 'Quebra de Mito / Paradigma',
    goal: 'Expor erros comuns ou crenças ultrapassadas que custam dinheiro ou tempo ao mercado.',
    hookTone: 'Contrário ao senso comum, surpreendente e embasado em fatos/métricas.'
  },
  case: {
    id: 'case',
    name: 'Estudo de Caso / Problema-Solução',
    goal: 'Demonstrar na prática como uma barreira complexa foi superada com metodologia e estratégia.',
    hookTone: 'Narrativo, focado em desafios reais, virada de chave e métricas de sucesso.'
  },
  visao_executiva: {
    id: 'visao_executiva',
    name: 'Visão Executiva / C-Level Briefing',
    goal: 'Decodificar macro-movimentos de mercado, governança corporativa, impacto em margem/EBITDA e decisões de conselho.',
    hookTone: 'Sóbrio, de alto escalão, focado em alocação de capital e vantagem competitiva sustentável.'
  },
  deep_dive: {
    id: 'deep_dive',
    name: 'Deep Dive Técnico / Framework Especialista',
    goal: 'Dissecar arquiteturas operacionais, frameworks práticos, métricas exatas e implementação minuciosa sem abstrações vazias.',
    hookTone: 'Técnico, cirúrgico, estruturado e altamente enriquecedor para praticantes experientes.'
  },
  contraintuitivo: {
    id: 'contraintuitivo',
    name: 'Tese de Ruptura / Contrarian Thinking',
    goal: 'Desafiar consensos cômodos da indústria, demonstrando com dados e lógica porque o senso comum está equivocado.',
    hookTone: 'Incisivo, provocador, intelectualmente refinado e amparado em contraprovas de mercado.'
  },
  mercado_brasil: {
    id: 'mercado_brasil',
    name: 'Impacto no Mercado Brasileiro / Panorama Nacional',
    goal: 'Traduzir tendências e rupturas internacionais para o contexto econômico, tributário, regulatório e cultural do Brasil.',
    hookTone: 'Contextualizado, pragmático e focado na realidade e competitividade do ecossistema brasileiro.'
  }
};

const EDITORIAL_ANGLES = {
  equilibrado: {
    id: 'equilibrado',
    name: 'Equilibrado & Estratégico',
    instruction: 'Aborde o tema sob múltiplos prismas com ponderação analítica, prós e contras e rigor executivo.'
  },
  foco_brasil: {
    id: 'foco_brasil',
    name: 'Impacto no Brasil (Regulação, Negócios & Consumidor)',
    instruction: 'Conecte o tema diretamente à realidade econômica, regulatória (LGPD, Banco Central, tributária) e comportamental do Brasil.'
  },
  pragmatico_roi: {
    id: 'pragmatico_roi',
    name: 'Eficiência de Capital & Foco em ROI',
    instruction: 'Priorize dados de retorno sobre investimento (ROI), redução de custos operacionais, otimização de margens e produtividade.'
  },
  futurismo_visao: {
    id: 'futurismo_visao',
    name: 'Futurismo & Sinais Fracos (Horizonte 1 a 3 anos)',
    instruction: 'Identifique sinais fracos (weak signals), rupturas tecnológicas e metodológicas que moldarão os próximos 12 a 36 meses.'
  },
  provocativo_debate: {
    id: 'provocativo_debate',
    name: 'Provocação Intelectual & Debate Aberto',
    instruction: 'Faça perguntas desconfortáveis, confronte comodismos da indústria e estimule discussões qualificadas nos comentários.'
  }
};

const EDITORIAL_DEPTHS = {
  c_level: {
    id: 'c_level',
    name: 'Executivo / C-Level (Alto Impacto & Decisão)',
    instruction: 'Linguagem executiva de alto nível, voltada para conselheiros, diretores e C-levels. Sem didatismo óbvio.'
  },
  especialista: {
    id: 'especialista',
    name: 'Especialista / Técnico Avançado',
    instruction: 'Profundidade máxima em detalhes técnicos, metodologias, terminologia precisa e métricas analíticas.'
  },
  didatico: {
    id: 'didatico',
    name: 'Educativo / Didático de Alta Clareza',
    instruction: 'Explicações límpidas, analogias práticas e conceitos mastigados sem perder a sofisticação.'
  },
  investigativo: {
    id: 'investigativo',
    name: 'Jornalístico / Investigativo & Fatos de Mercado',
    instruction: 'Tom de grande reportagem investigativa (estilo Bloomberg/McKinsey), expondo dados, bastidores e contrapontos.'
  }
};

const CONVERSION_GOALS = {
  salvamentos: {
    id: 'salvamentos',
    name: 'Material de Referência (Foco em Salvamentos)',
    instruction: 'Estruturado como checklist ou guia de consulta permanente para induzir o usuário a salvar o post.'
  },
  comentarios: {
    id: 'comentarios',
    name: 'Debate Aberto (Foco em Comentários)',
    instruction: 'Termina com dilemas estratégicos que exigem posicionamento do leitor, gerando debate nos comentários.'
  },
  compartilhamentos: {
    id: 'compartilhamentos',
    name: 'Tese Compartilhável (Foco em Difusão em Rede)',
    instruction: 'Articulação de pensamentos que o leitor tem orgulho de repostar no próprio feed corporativo.'
  },
  autoridade: {
    id: 'autoridade',
    name: 'Thought Leadership (Autoridade Incontestável)',
    instruction: 'Posiciona a marca no topo do setor através de profundidade intelectual sem apelo comercial direto.'
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
  const preferredProvider = (options.provider && options.provider !== 'auto') 
    ? options.provider 
    : (client.llm?.provider || (available.length > 0 ? available[0] : null));

  // 1. Se houver provedor configurado, utiliza LLM para ideação rica
  if (preferredProvider && preferredProvider !== 'none') {
    try {
      const systemInstructions = `Você é um diretor sênior de Estratégia de Conteúdo e Social Media para marcas de alto impacto.
Sua missão é sugerir exatamente ${count} ideias magnéticas de postagens para redes sociais com alto potencial de engajamento e autoridade editorial.

DIRETRIZES:
- As ideias devem ser contextualizadas para o nicho e público do cliente.
- Varie os arquétipos entre os seguintes:
  * "dica" (como fazer acionável)
  * "opiniao" (análise de tendência)
  * "mito" (quebra de crença comum)
  * "case" (problema-solução e ROI)
  * "visao_executiva" (impacto C-level e decisões de conselho)
  * "deep_dive" (framework técnico especialista)
  * "contraintuitivo" (tese de ruptura contrária ao senso comum)
  * "mercado_brasil" (tendência global aplicada ao mercado brasileiro)
- Crie ganchos magnéticos (hooks) que capturam a atenção nos primeiros 3 segundos.

RETORNO ESTRITAMENTE EM JSON no formato:
{
  "ideas": [
    {
      "id": "idea-1",
      "title": "Título magnético do post...",
      "topic": "Tema conciso e objetivo...",
      "pillar": "Qual pilar do cliente se conecta...",
      "archetype": "dica" | "opiniao" | "mito" | "case" | "visao_executiva" | "deep_dive" | "contraintuitivo" | "mercado_brasil",
      "editorialAngle": "equilibrado" | "foco_brasil" | "pragmatico_roi" | "futurismo_visao" | "provocativo_debate",
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
  const archetypesList = ['dica', 'opiniao', 'visao_executiva', 'mito', 'case', 'contraintuitivo', 'mercado_brasil', 'deep_dive'];
  const algorithmicIdeas = pillars.slice(0, count).map((pillar, idx) => {
    const archKey = archetypesList[idx % archetypesList.length];
    const arch = ARCHETYPES[archKey] || ARCHETYPES.dica;

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
      },
      visao_executiva: {
        title: `O Impacto de ${pillar} no EBITDA e nas Decisões de Diretoria`,
        hook: `Alocação de capital e governança: por que líderes executivos precisam repensar ${pillar} no planejamento estratégico.`,
        why: 'Conecta com diretores, conselheiros e tomadores de decisão de alto escalão.'
      },
      deep_dive: {
        title: `Framework Especialista: Arquitetura e Implementação de ${pillar}`,
        hook: `Sem generalismos ou teoria vazia: este é o framework metodológico completo para estruturar ${pillar}.`,
        why: 'Atrai especialistas que buscam métricas exatas e implementação prática.'
      },
      contraintuitivo: {
        title: `A Falácia de ${pillar}: Por Que a Maioria Está Queimando Recursos`,
        hook: `Todo mundo está seguindo a mesma cartilha sobre ${pillar}. Aqui está o motivo pelo qual essa estratégia pode custar caro:`,
        why: 'Gera forte curiosidade intelectual e viralização qualificada por questionar o status quo.'
      },
      mercado_brasil: {
        title: `${pillar}: Da Tendência Global à Realidade do Mercado Brasileiro`,
        hook: `Como adaptar as melhores práticas mundiais em ${pillar} para a regulação e o consumidor no Brasil.`,
        why: 'Oferece alta relevância local para tomadores de decisão e empresas no Brasil.'
      }
    };

    const chosen = templates[archKey] || templates.dica;

    return {
      id: `idea-algo-${idx + 1}`,
      title: chosen.title,
      topic: `${pillar} aplicado a ${niche}`,
      pillar,
      archetype: archKey,
      editorialAngle: 'foco_brasil',
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
 * equivalente ao conteúdo extraído de um artigo rico (para abastecer imageGen e copywriter),
 * incorporando as novas dimensões editoriais especialistas.
 */
async function synthesizeTopicContent({
  topic,
  archetype = 'dica',
  client = {},
  visualStyle,
  editorialAngle = 'equilibrado',
  editorialDepth = 'especialista',
  dataAnchor = '',
  targetAudienceOverride = '',
  conversionGoal = 'autoridade',
  options = {}
}) {
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    throw new Error('É necessário informar um tópico ou interesse do cliente.');
  }

  const cleanTopic = topic.trim();
  const arch = ARCHETYPES[archetype] || ARCHETYPES.dica;
  const angleObj = EDITORIAL_ANGLES[editorialAngle] || EDITORIAL_ANGLES.equilibrado;
  const depthObj = EDITORIAL_DEPTHS[editorialDepth] || EDITORIAL_DEPTHS.especialista;
  const goalObj = CONVERSION_GOALS[conversionGoal] || CONVERSION_GOALS.autoridade;

  const brandName = client.name || client.brandName || 'Marca';
  const niche = client.niche || 'Estratégia e Inovação';
  const audience = targetAudienceOverride && targetAudienceOverride.trim().length > 2
    ? targetAudienceOverride.trim()
    : (client.targetAudience || 'Profissionais e tomadores de decisão');
  const tone = client.tone || 'Especialista, tecnológico e focado em valor prático';
  const cleanDataAnchor = (dataAnchor || '').trim();
  const slug = slugify(cleanTopic);

  const available = detectAvailableProviders();
  const preferredProvider = (options.provider && options.provider !== 'auto') 
    ? options.provider 
    : (client.llm?.provider || (available.length > 0 ? available[0] : null));

  // 1. Tenta sintetizar com LLM para profundidade e sofisticação semântica
  if (preferredProvider && preferredProvider !== 'none') {
    try {
      const dataAnchorDirective = cleanDataAnchor
        ? `\nDADOS E FONTES ÂNCORA OBRIGATÓRIAS (E-E-A-T):
Utilize ativamente e cite estrategicamente a seguinte evidência/dado para ancorar a autoridade da matéria:
"${cleanDataAnchor}"`
        : '';

      const systemInstructions = `Você é um Estrategista-Chefe de Conteúdo e Editor Executivo de publicações de referência como MIT Technology Review, Harvard Business Review e Financial Times.
Sua missão é transformar um TÓPICO/INTERESSE em uma análise aprofundada de alto valor, completa e estruturada para distribuição multicanal.

MATRIZ EDITORIAL ESPECÍFICA:
- Arquétipo Editorial: "${arch.name}" (Objetivo: ${arch.goal})
- Tom do Gancho: "${arch.hookTone}"
- Nível de Profundidade: "${depthObj.name}" -> ${depthObj.instruction}
- Viés / Ângulo Editorial: "${angleObj.name}" -> ${angleObj.instruction}
- Objetivo de Conversão: "${goalObj.name}" -> ${goalObj.instruction}${dataAnchorDirective}

DIRETRIZES OBRIGATÓRIAS:
1. "title": Título executivo, magnético e sofisticado (entre 50 e 75 caracteres), sem fórmulas mecânicas ou clichês.
2. "description": Lead em 2-3 frases sintetizando a tese central, o impacto prático e o diferencial analítico.
3. "headings": Array com exatamente 3 ou 4 subtítulos estratégicos (estruturados em progressão lógica: Cenário, Análise de Ruptura, Framework Prático, Implicações Futuras).
4. "bulletPoints": Array com 4 takeaways essenciais, densos, acionáveis e mensuráveis.
5. "paragraphs": Array com 4 ou 5 parágrafos substanciais, articulados com precisão conceitual, vocabulário maduro e lições práticas do mercado.
6. "visualPromptHint": Descrição conceitual EM INGLÊS para gerar a arte de capa (NÃO inclua palavras nem textos, apenas elementos 3D conceituais, iluminação refinada ou fotografia editorial corporativa).

RETORNO ESTRITAMENTE EM JSON no seguinte formato:
{
  "title": "...",
  "description": "...",
  "headings": ["...", "...", "..."],
  "bulletPoints": ["...", "...", "...", "..."],
  "paragraphs": ["...", "...", "...", "..."],
  "visualPromptHint": "Conceptual 3D scene representing..."
}`;

      const userContent = `=== PAUTA DO ARTIGO ===
Tema: "${cleanTopic}"
Arquétipo: "${arch.name}"
Profundidade: "${depthObj.name}"
Viés / Ângulo: "${angleObj.name}"
Objetivo: "${goalObj.name}"
${cleanDataAnchor ? `Dados / Estatísticas Âncora: "${cleanDataAnchor}"` : ''}

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
            canonicalUrl: null,
            url: null,
            isTopicMode: true,
            archetype,
            editorialAngle,
            editorialDepth,
            dataAnchor: cleanDataAnchor,
            targetAudienceOverride: audience,
            conversionGoal,
            synthesizerMeta: {
              source: 'llm',
              provider: result.provider,
              model: result.model,
              editorialDimensions: {
                archetype: arch.name,
                depth: depthObj.name,
                angle: angleObj.name,
                conversionGoal: goalObj.name
              }
            }
          };
        }
      }
    } catch (err) {
      console.warn(`[Synthesizer Aviso] Falha na síntese via IA (${err.message}). Utilizando gerador algorítmico dinâmico.`);
    }
  }

  // 2. Fallback Algorítmico Estruturado Enriquecido com Vieses Editoriais
  let titlePrefix = 'Estratégia e Ação';
  if (archetype === 'visao_executiva') titlePrefix = 'Diretoria & Governança';
  else if (archetype === 'contraintuitivo') titlePrefix = 'A Verdade Contraintuitiva Sobre';
  else if (archetype === 'deep_dive') titlePrefix = 'Framework Especialista';
  else if (archetype === 'mercado_brasil') titlePrefix = 'Impacto no Mercado Brasileiro';
  else if (archetype === 'opiniao') titlePrefix = 'Perspectiva & Tendência';

  const title = `${titlePrefix}: ${cleanTopic}`;

  const anchorNote = cleanDataAnchor ? ` (Âncora de Mercado: ${cleanDataAnchor})` : '';
  const description = `Uma análise aprofundada com viés ${angleObj.name.toLowerCase()} sobre como implementar ${cleanTopic} com rigor executivo, foco em ${goalObj.name.toLowerCase()} e alto retorno${anchorNote}.`;

  const headings = [
    `O Panorama Estratégico de ${cleanTopic}`,
    cleanDataAnchor ? `Validação por Métricas e Evidências: ${cleanDataAnchor}` : 'Desafios Críticos e Oportunidades Reais',
    archetype === 'visao_executiva' ? 'Impacto na Tomada de Decisão e Alocação de Recursos' : 'Framework Metodológico de Implementação',
    `Conclusão e Próximos Passos para ${audience}`
  ];

  const bulletPoints = [
    `Diagnóstico aprofundado do cenário atual de ${cleanTopic}`,
    cleanDataAnchor ? `Ancoragem em fatos: ${cleanDataAnchor}` : 'Tomada de decisão fundamentada em métricas e dados de mercado',
    `Alinhamento metodológico direcionado para o perfil: ${audience}`,
    `Execução focada no objetivo de ${goalObj.name}`
  ];

  const paragraphs = [
    `O mercado está em constante transformação, e compreender ${cleanTopic} sob uma ótica especializada tornou-se uma competência indispensável para ${audience} que buscam sustentabilidade competitiva e liderança setorial.`,
    cleanDataAnchor
      ? `As evidências contemporâneas reforçam essa necessidade: ${cleanDataAnchor}. Esses dados demonstram que abordar o tema de forma genérica é insuficiente; a vantagem real pertence às organizações que implementam governança e processos estruturados.`
      : `A abordagem tradicional frequentemente comete o erro de focar apenas em soluções pontuais sem enxergar a esteira completa. No entanto, os resultados mais consistentes vêm da integração entre estratégia clara, viés ${angleObj.name.toLowerCase()} e execução disciplinada.`,
    `Para colocar essa visão em prática, o primeiro passo consiste em mapear os gargalos operacionais existentes, estabelecer indicadores de performance objetivos e adotar metodologias comprovadas que acelerem o retorno sobre o investimento.`,
    `Ao alinhar esses fundamentos sob a perspectiva de ${brandName}, sua empresa consolida autoridade de mercado e estabelece um padrão de excelência de referência para todo o ecossistema.`
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
    canonicalUrl: null,
    url: null,
    isTopicMode: true,
    archetype,
    editorialAngle,
    editorialDepth,
    dataAnchor: cleanDataAnchor,
    targetAudienceOverride: audience,
    conversionGoal,
    synthesizerMeta: {
      source: 'algorithmic',
      provider: 'Motor Nativo pub_rs',
      editorialDimensions: {
        archetype: arch.name,
        depth: depthObj.name,
        angle: angleObj.name,
        conversionGoal: goalObj.name
      }
    }
  };
}

module.exports = {
  ARCHETYPES,
  EDITORIAL_ANGLES,
  EDITORIAL_DEPTHS,
  CONVERSION_GOALS,
  suggestTopicIdeas,
  synthesizeTopicContent,
  slugify
};
