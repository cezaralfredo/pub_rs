# 🤖 pub_rs — Automação Omnichannel de Distribuição em Redes Sociais

Aplicação independente e multi-cliente desenvolvida para transformar qualquer artigo publicado na web em um pacote completo de distribuição para redes sociais (**LinkedIn, Instagram Feed, Instagram Stories, X/Twitter, Threads e Facebook**), redimensionando mídias automaticamente com branding personalizado e gerando copies contextualizadas com inteligência artificial ou motor algorítmico nativo.

---

## ⚡ Como Usar

No terminal, dentro da pasta `e:\Projetos\pub_rs`:

```bash
# Ajuda e listagem de clientes disponíveis
node index.js --help

# Uso básico com cliente padrão (Anauê Design)
node index.js --url https://anauedesign.com.br/blog/midia-paga-roi-real-atribuicao-first-party-data.html

# Uso especificando outro cliente cadastrado
node index.js --url https://site-do-cliente.com.br/artigo-novo --client cliente-advocacia
```

---

## 🧠 Motores de Redação Inteligente

O `pub_rs` conta com arquitetura de geração híbrida:

1. **Google Gemini API (Recomendado para máxima persuasão):**
   - Basta configurar `GEMINI_API_KEY` no arquivo `.env`.
   - Utiliza o modelo `gemini-2.5-flash` para criar copies nativas sob medida para cada rede social, respeitando o tom de voz e o público-alvo do cliente.
2. **Motor Algorítmico Dinâmico v2 (Nativo / Zero Custo):**
   - Ativado automaticamente se nenhuma chave de API for configurada.
   - Extrai introdução, destaques, tópicos e formata ganchos, listas, chamadas e parâmetros UTM dinamicamente com base 100% no conteúdo real do artigo (sem textos genéricos ou fixos).

---

## 🎨 Processamento Gráfico & Branding com Sharp

Gera automaticamente todas as variações em **WebP** e **JPG** nos padrões oficiais:
- **16:9** (1200x675) — Horizontal para LinkedIn, X/Twitter e Facebook.
- **4:5** (1080x1350) — Retrato ouro para Feed do Instagram com ambient blur e badge superior/inferior.
- **1:1** (1080x1080) — Quadrado para Threads e carrossel.
- **9:16** (1080x1920) — Vertical para Stories, Reels e WhatsApp Status.
- **Fallback Card SVG:** Caso o artigo original não possua imagem de destaque, o `pub_rs` gera instantaneamente um card visual moderno com tipografia elegante, o título do artigo e o badge de branding do cliente.

---

## 📁 Estrutura do Projeto

```
pub_rs/
├── config/
│   └── clients/
│       ├── anaue-design.json       # Perfil da Anauê Design
│       └── default.json            # Template padrão para novos clientes
├── src/
│   ├── scraper.js                  # Extrai JSON-LD, metadados, H2s e imagem original
│   ├── imageProcessor.js           # Sharp + SVG: 16:9, 4:5, 1:1, 9:16 e cards gráficos
│   ├── copywriter.js               # Redação dinâmica com Gemini AI + Fallback algorítmico
│   └── dispatcher.js               # Salva pacote local e dispara webhooks
├── workflows/
│   └── n8n_pub_rs_workflow.json    # Template pronto para importar no n8n
├── .env.example                    # Modelo de variáveis de ambiente
├── output/                         # Diretório local onde os pacotes de cada artigo são salvos
└── index.js                        # CLI principal
```

---

## 🏢 Como Cadastrar Novos Clientes

Basta criar um novo arquivo JSON em `config/clients/<id-do-cliente>.json`:

```json
{
  "id": "cliente-advocacia",
  "name": "Silva & Associados Advocacia",
  "brandName": "Silva & Associados",
  "brandHandle": "@silvaadv",
  "tone": "Formal, jurídico preventivo, consultivo e focado em empresários",
  "targetAudience": "Empresários, diretores jurídicos e CFOs",
  "defaultHashtags": ["#DireitoEmpresarial", "#Tributario", "#Gestao"],
  "callToAction": "Qual a sua dúvida sobre esse tema? Deixe nos comentários:",
  "includeFirstComment": true,
  "commentTemplate": "👉 Leia o artigo jurídico completo aqui: {URL}",
  "webhookUrl": ""
}
```

---

## 🌐 Integração com n8n, Make e Webhooks

1. Preencha `DEFAULT_WEBHOOK_URL` no `.env` ou `"webhookUrl"` no JSON do cliente.
2. Importe o arquivo [workflows/n8n_pub_rs_workflow.json](file:///e:/Projetos/pub_rs/workflows/n8n_pub_rs_workflow.json) no seu n8n para receber o pacote completo com todas as copies formatadas e caminhos das imagens prontos para publicação automática ou agendamento via Buffer/Metricool.
