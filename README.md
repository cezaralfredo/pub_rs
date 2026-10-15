# 🤖 pub_rs — Automação Omnichannel de Distribuição em Redes Sociais

Aplicação independente e multi-cliente desenvolvida para transformar qualquer artigo publicado na web em um pacote completo de distribuição para redes sociais (**LinkedIn, Instagram Feed, Instagram Stories, X/Twitter, Threads e Facebook**), redimensionando mídias automaticamente com branding personalizado e gerando copies contextualizadas com múltiplos provedores de Inteligência Artificial ou motor algorítmico nativo.

---

## ⚡ Como Usar

No terminal, dentro da pasta `e:\Projetos\pub_rs`:

```bash
# Ajuda e listagem de clientes e provedores disponíveis
node index.js --help

# Uso padrão com cliente padrão (Anauê Design)
node index.js --url https://anauedesign.com.br/blog/midia-paga-roi-real-atribuicao-first-party-data.html

# Escolhendo o provedor de IA via CLI (ex: Groq, Anthropic, OpenAI ou Gemini)
node index.js --url https://seusite.com/artigo --provider groq --model llama-3.3-70b-versatile
node index.js --url https://seusite.com/artigo --provider anthropic --model claude-3-5-sonnet-20241022
node index.js --url https://seusite.com/artigo --provider openai --model gpt-4o-mini
node index.js --url https://seusite.com/artigo --provider gemini --model gemini-2.5-flash

# Uso com LLM local via Ollama (zero custo e 100% privado)
node index.js --url https://seusite.com/artigo --provider ollama --model llama3
```

---

## 🧠 Suporte Universal a Provedores de LLM

O `pub_rs` conta com arquitetura modular multi-provedor com detecção automática e cadeia de *fallback*:

| Provedor | Variável no `.env` | Modelo Padrão | Destaque |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `GEMINI_API_KEY` | `gemini-2.5-flash` | Excelente contexto, raciocínio e alta velocidade |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` | Precisão semântica e padrão da indústria |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-20241022` | Escrita editorial humana, elegante e envolvente |
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Geração instantânea em milissegundos |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` | Custo ultrabaixo com alta inteligência |
| **OpenRouter** | `OPENROUTER_API_KEY` | `openai/gpt-4o-mini` | Acesso a centenas de modelos globais |
| **Ollama (Local)** | `OLLAMA_BASE_URL` | `llama3` | 100% privado, local e sem necessidade de chaves |
| **Motor Algorítmico v2** | *(Nenhuma chave)* | *Nativo* | Fallback automático dinâmico baseado no artigo real |

---

## 🎨 Processamento Gráfico, IA Visual & Branding com Sharp

Gera automaticamente todas as variações em **WebP** e **JPG** nos padrões oficiais:
- **16:9** (1200x675) — Horizontal para LinkedIn, X/Twitter e Facebook.
- **4:5** (1080x1350) — Retrato ouro para Feed do Instagram com ambient blur e badge superior/inferior.
- **1:1** (1080x1080) — Quadrado para Threads e carrossel.
- **9:16** (1080x1920) — Vertical para Stories, Reels e WhatsApp Status.

### 🖼️ Caso o artigo NÃO possua imagem de destaque:
1. **Geração de Arte Conceitual via IA (DALL-E 3 / Imagen 3):**
   - Se configurado (`--ai-image`, `"generateAiImage": true` no cliente ou `GENERATE_AI_IMAGE=auto` no `.env`), o `pub_rs` cria automaticamente uma ilustração conceitual em alta definição a partir do **título e resumo do artigo**, sem textos sobrepostos e com iluminação cinematográfica.
   - Essa arte é imediatamente redimensionada e adaptada para os 4 formatos oficiais de redes sociais com os badges de marca do cliente.
2. **Fallback para Card Gráfico SVG:**
   - Caso nenhuma API de imagem esteja configurada ou ocorra timeout, o sistema cria um card em degradê escuro com tipografia moderna, grade sutil e a marca do cliente sobreposta via Sharp SVG.

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
│   ├── copywriter.js               # Redação dinâmica com orquestrador multi-LLM
│   ├── dispatcher.js               # Salva pacote local e dispara webhooks
│   └── llm/                        # Módulo Universal Multi-LLM
│       ├── index.js                # Orquestrador com detecção e fallback
│       ├── promptBuilder.js        # Montagem do prompt omnichannel unificado
│       └── providers/              # Adaptadores para cada API de IA
│           ├── gemini.js           # Google Gemini
│           ├── openai.js           # OpenAI, Groq, DeepSeek, OpenRouter
│           ├── anthropic.js        # Anthropic Claude
│           └── ollama.js           # Ollama Local
├── workflows/
│   └── n8n_pub_rs_workflow.json    # Template pronto para importar no n8n
├── .env.example                    # Modelo completo de variáveis de ambiente
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
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "apiKey": "",
    "baseUrl": ""
  },
  "defaultHashtags": ["#DireitoEmpresarial", "#Tributario", "#Gestao"],
  "callToAction": "Qual a sua dúvida sobre esse tema? Deixe nos comentários:",
  "includeFirstComment": true,
  "commentTemplate": "👉 Leia o artigo jurídico completo aqui: {URL}",
  "channels": {
    "webhook": { "enabled": true, "url": "" },
    "telegram": { "enabled": false, "botToken": "", "chatId": "" },
    "linkedin": { "enabled": false, "accessToken": "", "authorUrn": "" },
    "twitter": { "enabled": false, "bearerToken": "", "accessToken": "" },
    "meta": { "enabled": false, "pageAccessToken": "", "pageId": "", "instagramAccountId": "" },
    "buffer": { "enabled": false, "accessToken": "", "profileIds": [] }
  }
}
```

---

## 🌐 pub_rs Studio — Interface Web & Background Manager

Inicie o servidor integrado com o comando:
```bash
npm start
```
Acesse no navegador: **`http://localhost:3001`**

### Recursos do Estúdio Web:
1. **Painel de Gestão de Clientes & Background:**
   - Adicione e gerencie múltiplos clientes/marcas com alternância rápida.
   - Configure a **IA de sua escolha** por cliente (Gemini, OpenAI, Claude, Groq, DeepSeek, OpenRouter, Ollama) com chave dedicada, modelo customizado e endpoint/Base URL personalizado.
   - **Teste de Conexão com a IA em Tempo Real:** valide imediatamente se a chave privada e o modelo escolhidos estão operacionais com medição de latência em milissegundos.
   - Configure credenciais de redes sociais (**Webhook, Telegram Bot, LinkedIn, Twitter/X, Meta Facebook/Instagram e Buffer**) com testes de conexão individuais ou em lote.
   - **Segurança de Nível Corporativo:** mascaramento seguro de tokens na interface (`sk-...4a9f`), proteção contra SSRF e path traversal.
2. **Sistema de Background & Agendador Automático:**
   - Opção de **Publicar Imediatamente** ou **Agendar Publicação em Background** para data e hora futuras.
   - Worker em background com checagem contínua e retentativa automática (backoff exponencial) em caso de oscilação de rede social.
   - Acompanhamento da fila com badges de status (`scheduled`, `processing`, `published`, `failed`), logs de execução e botões de **Repetir (Retry)** e **Cancelar**.
3. **Studio Interativo de Copies & Mídias:**
   - Pré-visualização de copies adaptadas por canal, contador de caracteres, suporte a primeiro comentário para engajamento e threads completas.
   - Galeria com download em 1 clique das artes cortadas em WebP e JPG para todos os formatos (16:9, 4:5, 1:1, 9:16).

