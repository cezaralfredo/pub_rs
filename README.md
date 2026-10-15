# 🤖 pub_rs — Automação Omnichannel de Distribuição em Redes Sociais

Aplicação independente e multi-cliente desenvolvida para transformar qualquer artigo publicado na web em um pacote completo de distribuição para redes sociais (LinkedIn, Instagram, X/Twitter, Threads e Facebook), redimensionando mídias automaticamente e gerando textos otimizados com regras de primeiro comentário.

---

## ⚡ Como Usar

No terminal, dentro da pasta `e:\Projetos\pub_rs`:

```bash
# Uso básico com cliente padrão (Anauê Design)
node index.js --url https://anauedesign.com.br/blog/midia-paga-roi-real-atribuicao-first-party-data.html

# Uso especificando outro cliente da sua carteira
node index.js --url https://site-do-cliente.com.br/artigo-novo --client nome-do-cliente
```

---

## 📁 Estrutura do Projeto

```
pub_rs/
├── config/
│   └── clients/
│       ├── anaue-design.json       # Perfil da Anauê Design
│       └── default.json            # Template padrão para novos clientes
├── src/
│   ├── scraper.js                  # Extrai metadados, H1, H2s e imagem original
│   ├── imageProcessor.js           # Sharp: gera 16:9, 4:5 (feed portrait), 1:1 e 9:16
│   ├── copywriter.js               # Redige textos por rede, UTMs e 1º comentário
│   └── dispatcher.js               # Exporta pacote e envia via webhook (opcional)
├── output/                         # Diretório onde os pacotes de cada artigo são salvos
│   └── YYYY-MM-DD_slug-do-artigo/
│       ├── PACOTE_REDES_SOCIAIS.md # Resumo executivo completo
│       ├── payload.json            # Dados estruturados para APIs
│       ├── copys/                  # Arquivos individuais prontos para copiar
│       └── images/                 # Imagens em WebP e JPG nos 4 formatos
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
  "defaultHashtags": ["#DireitoEmpresarial", "#Tributario", "#Gestao"],
  "callToAction": "Qual a sua dúvida sobre esse tema? Deixe nos comentários:",
  "includeFirstComment": true,
  "commentTemplate": "👉 Leia o artigo jurídico completo aqui: {URL}",
  "webhookUrl": ""
}
```

---

## 🌐 Integração com Webhook (Opcional)

Se você preencher `"webhookUrl"` no JSON do cliente com a URL de um webhook do **n8n**, **Make.com**, **Metricool** ou **Buffer**, o `pub_rs` disparará automaticamente o `payload.json` contendo todas as copies e caminhos das imagens assim que o processamento terminar!
