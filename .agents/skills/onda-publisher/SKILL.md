---
name: onda-publisher
description: Publica automaticamente novos artigos e notícias no blog da Onda Conecta, validando o frontmatter do Astro, calculando IDs sequenciais, tempo de leitura e gerando o commit e push no Git para deploy contínuo.
---

# Onda Conecta — Skill de Publicação Automática (onda-publisher)

Esta skill é responsável por receber um artigo redigido, formatá-lo segundo os padrões estritos do Astro e do ecossistema Onda Conecta, salvá-lo no local correto e disparar o deploy via Git.

---

## 1. Regras do Schema de Conteúdo (Astro Content Collection)

Todo artigo deve ser salvo em formato MDX em:
`src/content/blog/<slug>.mdx`

O frontmatter **deve** conter obrigatoriamente os seguintes campos validados pelo `src/content.config.ts`:

```yaml
---
id: <número sequencial incremental>
slug: '<slug-amigavel-separado-por-hifens>'
lang: 'pt' # ou 'en' ou 'es'
translationOf: '<slug-do-artigo-principal>' # para 'en' e 'es'
title: '<Título chamativo e otimizado para SEO>'
description: '<Metadescrição atraente de 120 a 160 caracteres>'
imageUrl: '<Caminho da imagem em /images/blog-post/... ou URL externa>'
imageAlt: '<Texto alternativo descritivo para acessibilidade e SEO>'
pubDate: '<Data por extenso ou legível, ex: 10 de Março de 2026>'
author: 'Redação Onda Conecta'
avatarUrl: '/images/avatars/1.webp'
category: '<Categoria Válida>'
readTime: <tempo estimado em minutos, ex: 5>
featured: false # ou true se for manchete principal
---
```

### Categorias Padronizadas (9 Categorias Oficiais Ativas):

- `Inovação & IA` (inclui inteligência artificial, automação e tendências tecnológicas)
- `Mercado & Negócios`
- `Finanças Pessoais`
- `Saúde & Bem-estar`
- `Estética & Beleza`
- `Estilo de Vida & Viagens`
- `Tendências`
- `Sustentabilidade`
- `Comportamento`

---

## 2. Regras de Blindagem Técnica e Engenharia

Para evitar quebras no build do Astro e inconsistências em produção, a skill aplica as seguintes regras obrigatórias:

### A. Sanitização e Escape Seguro de Strings no YAML:
- Campos como `title`, `description` e `imageAlt` frequentemente possuem aspas simples (`'`), aspas duplas (`"`) ou dois-pontos (`:`).
- **Regra:** Sempre use aspas duplas delimitando os valores textuais no frontmatter, escapando aspas internas com `\"`.
  ```yaml
  title: "IA em 2026: O que muda nos investimentos e no mercado de trabalho?"
  description: "Entenda o impacto prático dos agentes autônomos e como proteger seus rendimentos."
  ```

### B. Cálculo Dinâmico Real de Tempo de Leitura (`readTime`):
- O `readTime` nunca deve ser um valor arbitrário.
- **Fórmula:** Conte o total de palavras do corpo do artigo (excluindo o frontmatter) e divida pela média de leitura humana (200 palavras por minuto):
  $$\text{readTime} = \max(1, \text{Math.ceil}(\text{palavras} / 200))$$

### C. Formatação Nativa de Datas (`pubDate`):
Cada versão idiomática deve receber a data formatada de acordo com os padrões locais da sua região:
- **Português (`pt`):** Formato extenso brasileiro (ex: `"10 de Março de 2026"`).
- **Inglês (`en`):** Formato nativo norte-americano (ex: `"March 10, 2026"`).
- **Espanhol (`es`):** Formato nativo hispânico (ex: `"10 de Marzo de 2026"`).

### D. Gestão Equilibrada da Flag `featured`:
- O artigo original em português recebe `featured: true` apenas se for a principal matéria da categoria na semana (ou com `urgency_score >= 8`).
- As versões em inglês e espanhol acompanham o mesmo valor da flag da versão principal.

### E. Validação Prévia de Monetização e AdSense (Compliance Check):
Antes de gerar o build e comitar, a skill deve verificar os 3 pilares de monetização:
1. **Auditoria de Categoria Ativa:** Certificar-se de que a `category` pertence às 9 categorias oficiais permitidas. Jamais aceitar a categoria obsoleta `"Tecnologia"` (se vier com esse valor, converter automaticamente para `"Inovação & IA"`).
2. **Checagem Anti-Thin Content:** Validar se o artigo tem extensão substantiva (mínimo de 700 a 800 palavras no corpo do texto). Artigos superficiais devem ser rejeitados para reescrita antes de entrar na esteira de publicação.
3. **Segurança de Links Comerciais:** Se o artigo contiver links externos de afiliados ou parceiros de e-commerce (ex: Shopee, Amazon, etc.), verificar se possuem obrigatoriamente `rel="nofollow sponsored noopener noreferrer"` e a nota de transparência editorial.

---

## 3. Passo a Passo de Execução da Publicação Multilíngue

Quando o usuário ou o orquestrador disparar a publicação:

1. **Obter o Próximo ID Sequencial:**
   - Liste os arquivos existentes em `src/content/blog/`.
   - Identifique o maior número de `id` nos frontmatters existentes.
   - Atribua `maior_id + 1` para o artigo em português, `maior_id + 2` para o inglês e `maior_id + 3` para o espanhol.

2. **Gerar e Salvar os Arquivos MDX:**
   - `src/content/blog/<slug>.mdx` (Português, `lang: 'pt'`)
   - `src/content/blog/<slug>-en.mdx` (Inglês, `lang: 'en'`, `translationOf: '<slug>'`)
   - `src/content/blog/<slug>-es.mdx` (Espanhol, `lang: 'es'`, `translationOf: '<slug>'`)

3. **Garantir a Capa Otimizada:**
   - Confirme a existência do arquivo de capa compartilhado em `public/images/blog-post/<slug>.webp`.

4. **Validação do Build Local (Zero-Error Policy):**
   - Execute no terminal: `npm run build`.
   - Se o comando retornar código de saída diferente de 0, **interrompa o fluxo imediatamente**, identifique o erro de schema ou sintaxe no MDX e corrija antes de qualquer ação no Git.

5. **Deploy Contínuo via Git:**
   - Execute com segurança:
     ```bash
     git add src/content/blog/<slug>* public/images/ scripts/published-history.json
     git commit -m "feat(blog): publicar <slug> em pt/en/es"
     git push origin main
     ```
   - O pipeline de CI/CD (GitHub Actions) iniciará automaticamente o deploy em produção e notificará os motores de busca (Bing/Yandex) via **IndexNow**.
   - Opcionalmente, pode-se disparar a notificação imediata das novas URLs via terminal: `npm run indexnow`.

