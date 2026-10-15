---
name: onda-cron-agent
description: Executa o ciclo autônomo completo de inteligência do Onda Conecta: pesquisa as principais tendências e notícias globais na web em tempo real por categoria, redige o artigo original para o Brasil e as versões em inglês e espanhol, gera a imagem/capa, valida o build estático e publica direto no Git/produção.
---

# Onda Conecta — Skill de Execução Autônoma (onda-cron-agent)

Esta skill permite que o Antigravity execute autonomamente o ciclo de pesquisa, redação e publicação do portal **Onda Conecta**, funcionando sob demanda ou via cron agendada (`/schedule`).

---

## 🎯 Categorias Monitoradas & Espectro Editorial

A skill monitora e publica matérias estratégicas nas seguintes verticais:

1. **Inovação & IA** (`Innovation & AI` / `Innovación e IA`) — Agentes autônomos, inteligência artificial generativa, automação corporativa, LLMs e futuro do trabalho.
2. **Mercado & Negócios** (`Business & Markets` / `Mercados y Negocios`) — Startups, venture capital, macroeconomia, fusões, ecossistema corporativo.
3. **Finanças Pessoais** (`Personal Finance` / `Finanzas Personales`) — Investimentos, planejamento financeiro, finanças inteligentes, criptoeconomia, finanças comportamentais.
4. **Saúde & Bem-estar** (`Health & Wellness` / `Salud y Bienestar`) — Longevidade saudável, biohacking, saúde mental, medicina preventiva, biotecnologia.
5. **Estética & Beleza** (`Beauty & Aesthetics` / `Estética y Belleza`) — Tendências em skincare, estética avançada, cosméticos inteligentes, sustentabilidade na beleza e dermotecnologia.
6. **Estilo de Vida & Viagens** (`Lifestyle & Travel` / `Estilo de Vida y Viajes`) — Destinos em alta, turismo de experiência, trabalho remoto global (nômades digitais), design de vida e tendências culturais.
7. **Tendências & Comportamento** (`Trends` / `Tendencias`) — Mudanças de consumo, comportamento das novas gerações, novos hábitos urbanos.
8. **Tecnologia & Futuro** (`Technology` / `Tecnología`) — Semicondutores, cibersegurança, computação em nuvem, computação quântica.
9. **Sustentabilidade & ESG** (`Sustainability` / `Sostenibilidad`) — Mercado de carbono, tecnologias limpas (climate tech), transição energética e ESG.

---

## 🔄 Fluxo de Orquestração Modular de Elite (Passo a Passo)

Sempre que esta skill for invocada sob demanda ou disparada via timer/cron (`/schedule`):

### 1. Seleção Inteligente de Categoria e Paridade (Round-Robin & 50/50)
- **Consulta de Histórico:** O orquestrador lê `scripts/published-history.json` para inspecionar as publicações mais recentes.
- **Critério de Balanceamento (Round-Robin):** Seleciona automaticamente a categoria que está há mais tempo sem publicação (a menos que o usuário especifique uma categoria manualmente).
- **Alternância de Foco Editorial (50/50):** 
  - Se a publicação anterior teve foco **Nacional**, a rodada atual obrigatoriamente prioriza um acontecimento **Global com impacto no Brasil**.
  - Se a anterior foi **Global**, prioriza pauta **Nacional**.

### 2. Curadoria e Pesquisa de Pauta (`onda-researcher`)
- Aciona a skill `onda-researcher` com a categoria e o foco definidos.
- Recebe o **Briefing JSON Estruturado** contendo:
  - Título preliminar, slug sugerido e ângulo de relevância nacional.
  - Fontes primárias de autoridade (comprovadas) e pontos estatísticos (E-E-A-T).
  - Validação rigorosa de não-duplicidade nos últimos 30 dias.

### 3. Direção de Arte e Capa Visual (`onda-designer`)
- Repassa à skill `onda-designer` o tema, categoria e slug.
- A skill gera a imagem no padrão editorial em proporção **16:9**, salva em `public/images/blog-post/<slug>.webp` e retorna os metadados de acessibilidade (`imageAlt` em PT, EN, ES).
- **Tolerância a Falhas:** Em caso de indisponibilidade do gerador, ativa automaticamente o fallback por categoria sem interromper a esteira.

### 4. Redação Editorial e SEO Multilíngue (`onda-writer`)
- Fornece à skill `onda-writer` o Briefing JSON + os dados visuais da imagem.
- A redação é conduzida de forma sequencial e com as novas diretrizes de elite:
  - Artigo mestre em Português (`src/content/blog/<slug>.mdx`) com bloco "Em Poucas Linhas" (Key Takeaways), dados estatísticos e FAQ para busca por IA / Featured Snippets.
  - Transposição nativa e fluente para Inglês (`src/content/blog/<slug>-en.mdx`).
  - Transposição nativa e fluente para Espanhol (`src/content/blog/<slug>-es.mdx`).

### 5. Validação Técnica, Deploy e Rollback (`onda-publisher`)
- Aciona a skill `onda-publisher` passando o lote de arquivos.
- Executa a sanitização do YAML, cálculo do `readTime` real e teste de compilação: `npm run build`.
- **Protocolo de Rollback (Circuit Breaker):**
  - Se o build falhar, a skill cancela o lote (`git checkout -- .`), registra o erro no log e avisa o usuário, garantindo que código quebrado **nunca seja commitado**.
  - Se o build passar com 100% de sucesso, realiza o commit e push contínuo:
    ```bash
    git add src/content/blog/<slug>* public/images/ scripts/published-history.json
    git commit -m "feat(auto): publicação de tendência <slug> em pt/en/es"
    git push origin main
    ```
- Grava no `scripts/published-history.json` o registro analítico enriquecido:
  ```json
  {
    "id": <id>,
    "slug": "<slug>",
    "category": "<categoria>",
    "focus": "Nacional" | "Global",
    "publishedAt": "<timestamp>",
    "sources": ["<fonte 1>", "<fonte 2>"]
  }
  ```

---

## 📊 Dashboard Executivo de Conclusão de Ciclo

Ao finalizar o ciclo com sucesso, o `onda-cron-agent` apresenta um resumo executivo estruturado:

```markdown
### 🚀 Relatório Executivo de Publicação — Onda Conecta
- **Matéria:** [Título em Português]
- **Categoria:** [Nome da Categoria] | **Foco:** [Nacional / Global com impacto local]
- **Slugs Gerados:**
  - 🇧🇷 `src/content/blog/<slug>.mdx` (PT)
  - 🇺🇸 `src/content/blog/<slug>-en.mdx` (EN)
  - 🇪🇸 `src/content/blog/<slug>-es.mdx` (ES)
- **Capa Visual:** `public/images/blog-post/<slug>.webp` (16:9 WebP)
- **Tempo de Leitura:** [X] min | **Fontes Citadas:** [Fonte 1, Fonte 2]
- **Status do Deploy:** ✅ Build Astro validado | Commit enviado para a branch `main`.
```


