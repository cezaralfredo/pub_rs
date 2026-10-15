---
name: onda-designer
description: Responsável pela direção de arte editorial, geração de imagens de capa em alta definição (16:9), composição de prompts visuais refinados, salvamento padronizado em WebP e metadados de acessibilidade/SEO visual.
---

# Onda Conecta — Skill de Direção de Arte e Capas (onda-designer)

Esta skill atua como o **diretor de arte editorial** do portal **Onda Conecta**. Sua função é garantir que toda matéria publicada tenha uma capa com estética impecável de revista internacional, sem artes genéricas ou elementos visuais defeituosos.

---

## 1. Diretrizes de Estética Editorial (Brand Guidelines)

Todas as capas do Onda Conecta devem seguir rigorosamente os seguintes pilares visuais:

- **Proporção Obrigatória:** `16:9` (proporção padrão para web, redes sociais e cards do Astro).
- **Regra de Ouro:** **NUNCA incluir texto renderizado dentro da imagem**. A inteligência artificial de imagem não deve tentar escrever palavras, títulos ou logotipos na imagem, pois gera letras deformadas e prejudica a estética.
- **Estilo Visual por Vertical:**
  - **Inovação, IA & Tech:** Fotografia minimalista com iluminação volumétrica, arte conceitual 3D limpa, circuitos orgânicos ou estética biomórfica de alta tecnologia. Sem clichês óbvios (evitar "robôs azuis genéricos").
  - **Mercado & Negócios:** Fotografia editorial contemporânea, arquitetura moderna em tons neutros, profundidade de campo cinematográfica.
  - **Finanças Pessoais:** Composições visuais sofisticadas, metáforas gráficas elegantes, visual limpo e contemporâneo.
  - **Saúde & Longevidade:** Iluminação natural, luz do dia, atmosfera biofílica, serenidade, vitalidade e precisão laboratorial estética.
  - **Estética & Beleza:** Close-up macro em texturas dermocosméticas, reflexos de luz, gotas puras, tons pastéis e sofisticação de editorial de moda (*Vogue/Allure*).
  - **Estilo de Vida & Viagens:** Fotografia de paisagem imersiva com enquadramento de cinema, arquitetura integrada à natureza ou momentos de trabalho contemporâneo autêntico.
  - **Sustentabilidade & Futuro:** Paisagens regenerativas, ecossistemas tecnológicos integrados, tons de verde sálvia, terra e luz solar.

---

## 2. Modos Visuais Especializados

A skill seleciona dinamicamente entre dois grandes modos visuais de acordo com o tema:

1. **Modo Fotojornalismo Editorial (Human, Markets & Lifestyle):**
   - *Uso:* Mercado, Finanças, Pessoas, Viagens, Longevidade e Beleza.
   - *Estética:* Emulação de lentes de médio formato (Hasselblad / Leica), profundidade de campo rasa (`shallow depth of field`, abertura f/1.8), iluminação natural ou luz de estúdio suave, granulação sutil de película analógica de 35mm.
2. **Modo Arte Conceitual 3D Minimalista (Tech, Future & ESG):**
   - *Uso:* Inteligência Artificial, Computação Quântica, Transição Energética e Conceitos Abstratos.
   - *Estética:* Render limpo em iluminação volumétrica, materiais tangíveis (vidro fosco, cerâmica fosca, titânio, formas biomórficas fluidas), paleta monocromática elegante com ponto focal de cor.

---

## 3. Biblioteca de Negative Prompts (Anti-Defeitos)

Para garantir que o modelo gerador não crie artefatos indesejados, todo prompt montado pela skill deve anexar a seguinte lista de exclusões obrigatórias:

> **Negative Term Block:**
> `text, letters, words, typography, logo, watermark, signature, caption, blurry, distorted anatomy, extra fingers, mutated hands, plastic skin, cheap stock photo aesthetic, oversaturated neon colors, childish cartoon, 3d render cliches, glowing blue circuit lines`.

---

## 4. Processo de Execução da Direção de Arte

Quando a skill for acionada com o tema, slug e categoria da matéria:

1. **Elaboração do Prompt Visual:**
   - Criar um prompt detalhado em inglês (para máxima fidelidade do modelo gerador), aplicando o modo visual adequado.
   - Adicionar os termos positivos de composição (`cinematic lighting, elegant minimalist composition, 8k resolution, shot on 35mm lens, no text`) e os termos negativos da Seção 3.

2. **Geração da Imagem:**
   - Acionar a ferramenta de geração com `AspectRatio: "16:9"`.
   - Salvar o arquivo no caminho oficial: `public/images/blog-post/<slug>.webp`.

3. **Mecanismo de Contingência / Fallback:**
   - Se por qualquer motivo a geração falhar, a skill ativa o fallback correspondente à categoria em `public/images/fallback/<categoria-slug>.webp` (ou seleciona uma capa abstrata existente), garantindo que a esteira nunca pare e o build nunca quebre.

4. **Metadados de Acessibilidade & SEO da Imagem:**
   - Formular o `imageAlt` semântico e descritivo em português (ex: descrevendo elementos, iluminação e foco para acessibilidade e Google Imagens).
   - Formular também as versões em inglês e espanhol para uso nos respectivos artigos.

---

## 5. Contrato de Saída: Metadados Visuais

A `onda-designer` entrega os dados visuais prontos para consumo das skills de redação e publicação:

```json
{
  "imageUrl": "/images/blog-post/<slug>.webp",
  "imageAlt": {
    "pt": "<Descrição detalhada e rica em português>",
    "en": "<Rich semantic description in English>",
    "es": "<Descripción semántica rica en español>"
  },
  "visualPromptUsed": "<Texto do prompt gerado>",
  "aspectRatio": "16:9",
  "usedFallback": false,
  "status": "ready"
}
```

