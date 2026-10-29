# 📘 Guia Definitivo: Onde e Como Obter os Dados de Cada Rede Social para o Social360 Studio

Este guia prático ensina passo a passo como obter todas as chaves de API, tokens e identificadores necessários para conectar as redes sociais e automações no **Social360 Studio** (tanto pela interface gráfica no painel de cada cliente quanto pelo arquivo de configuração `config/clients/seu-cliente.json`).

---

## 📌 Sumário Rápido

1. [Onde Inserir os Dados na Plataforma](#-onde-inserir-os-dados-na-plataforma)
2. [Método Recomendado: Buffer API (Multicanal em 1 Clique)](#1-buffer-api-agendamento-multicanal-unificado)
3. [LinkedIn Direct API (v2)](#2-linkedin-direct-api-v2)
4. [Meta Graph API (Facebook Page & Instagram Profissional)](#3-meta-graph-api-facebook-page--instagram)
5. [X / Twitter API (v2)](#4-x-twitter-api-v2)
6. [Telegram (Canais e Grupos)](#5-telegram-bot-api)
7. [Webhooks (n8n, Make, Zapier, Metricool)](#6-webhooks-n8n-make-zapier-metricool)
8. [Chaves de Inteligência Artificial (Opcional por Cliente)](#7-chaves-de-inteligência-artificial-llm)
9. [Como Testar as Conexões no Painel](#8-como-testar-as-conexões-no-painel)

---

## 🧭 Onde Inserir os Dados na Plataforma

Existem **duas formas** de configurar os acessos de cada cliente:

### Opção A: Pela Interface Web do Social360 Studio (Recomendado)
1. Acesse o painel do Social360 em: [https://social360.anauedesign.com.br](https://social360.anauedesign.com.br)
2. No menu superior ou lateral, clique em **Clientes** ➔ selecione o cliente desejado e clique em **Editar Cliente** (ou crie um novo).
3. No modal que abrir, clique na aba **"Canais & Redes Sociais"**.
4. Ative a chave de alternância (toggle) do canal desejado, preencha os campos e clique no botão **"Testar"** para validar.
5. Clique em **"Salvar Configurações do Cliente"**.

### Opção B: Direto no Arquivo de Configuração JSON
Você pode editar diretamente o arquivo em `config/clients/<id-do-cliente>.json`:
```json
{
  "channels": {
    "webhook": { "enabled": true, "url": "https://..." },
    "buffer": { "enabled": true, "accessToken": "...", "profileIds": ["..."] },
    "linkedin": { "enabled": true, "accessToken": "...", "authorUrn": "urn:li:organization:..." },
    "twitter": { "enabled": true, "bearerToken": "..." },
    "telegram": { "enabled": true, "botToken": "...", "chatId": "@meucanal" },
    "meta": { "enabled": true, "pageAccessToken": "...", "pageId": "...", "instagramAccountId": "..." }
  }
}
```

---

## 1. Buffer API (Agendamento Multicanal Unificado)
> **💡 Por que usar?** É a forma mais simples e rápida de conectar múltiplas redes (Instagram, Facebook, LinkedIn, X/Twitter, Pinterest, TikTok) usando uma única integração oficial, sem precisar passar por aprovações complexas de desenvolvedores em cada rede.

### Campos Solicitados no Social360:
- **Access Token do Buffer**
- **IDs dos Perfis (separados por vírgula)**

### Passo a Passo:
1. **Criar ou acessar sua conta:** Acesse [https://buffer.com](https://buffer.com) e conecte suas redes sociais normalmente no painel do Buffer.
2. **Acessar a área de desenvolvedores:**
   - Acesse: [https://buffer.com/developers/apps](https://buffer.com/developers/apps) (ou [https://login.buffer.com](https://login.buffer.com) se solicitado).
3. **Criar um App:**
   - Clique em **"Create an App"**.
   - Dê um nome (ex: `Social360 Studio`).
   - Preencha os campos de URL com o seu site (ex: `https://social360.anauedesign.com.br`).
4. **Obter o Access Token:**
   - Após criar o app, você verá o campo **"Access Token"** permanente gerado para sua conta.
   - Copie esse token e cole no campo **Access Token do Buffer** no Social360.
5. **Obter os IDs dos Perfis (Profile IDs):**
   - No painel do Buffer web, clique em um dos seus canais conectados na barra lateral esquerda.
   - Olhe a URL no navegador:
     `https://publish.buffer.com/profile/64b8a123456789abcdef/tab/queue`
   - O código alfanumérico após `/profile/` (ex: `64b8a123456789abcdef`) é o **Profile ID**.
   - Se for publicar em mais de uma rede pelo Buffer, pegue os IDs de cada uma e separe por vírgula no Social360:
     `64b8a123456789abcdef, 64c9f987654321fedcba`

---

## 2. LinkedIn Direct API (v2)
> Permite publicação direta no perfil pessoal ou na Company Page da empresa, incluindo upload nativo de copies, carrosséis em PDF e imagens.

### Campos Solicitados no Social360:
- **Access Token (OAuth 2.0)**
- **Author URN** (Identificador único do autor)

### Passo a Passo:
1. **Acesse o Portal de Desenvolvedores do LinkedIn:**
   - Acesse: [https://www.linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
   - Faça login com sua conta do LinkedIn.
2. **Criar um Aplicativo:**
   - Clique em **"Create App"**.
   - **App Name:** `Social360 Studio` (ou nome da sua agência).
   - **LinkedIn Page:** Associe a Company Page oficial da sua empresa.
   - Faça upload do logotipo da empresa e aceite os termos.
3. **Solicitar Produtos de Publicação:**
   - Na aba **"Products"**, adicione:
     - **Share on LinkedIn** (Permite publicar textos, links e imagens).
     - **Sign In with LinkedIn using OpenID Connect** (Permite ler informações de perfil).
   - Caso vá publicar em Company Page empresarial, adicione também o produto **Community Management API** se disponível.
4. **Verificação da Empresa (Página):**
   - Na aba **"Settings"**, clique em **"Verify"** para enviar uma notificação de aprovação ao administrador da Company Page no LinkedIn. Acesse a página e confirme a autorização.
5. **Gerar o Access Token:**
   - O método mais rápido para uso interno é usar o **Token Generator do LinkedIn**:
     Acesse a aba **"Auth"** ➔ **"OAuth 2.0 Tools"** ➔ selecione o aplicativo ➔ selecione os escopos `w_member_social` e `w_organization_social` (se disponível) ➔ clique em **Request Token**.
   - Copie o token de acesso gerado.
6. **Obter o Author URN:**
   - **Para Company Page (Página de Empresa):**
     1. Abra a página da empresa no LinkedIn como administrador.
     2. Olhe a URL no navegador: `https://www.linkedin.com/company/12345678/admin/`
     3. O número `12345678` é o ID da empresa.
     4. Seu Author URN será: `urn:li:organization:12345678`
   - **Para Perfil Pessoal:**
     1. O URN segue o padrão `urn:li:person:ID_DO_USUARIO`.
     2. Você pode obter seu ID pessoal testando uma requisição GET em `https://api.linkedin.com/v2/userinfo` com o token gerado.

---

## 3. Meta Graph API (Facebook Page & Instagram)
> Permite publicar posts no feed da Página do Facebook e fotos/carrosséis na Conta Profissional do Instagram vinculada.

### Campos Solicitados no Social360:
- **Page Access Token** (Token de acesso com permissão de publicação)
- **Page ID** (ID da Página do Facebook)
- **Instagram Account ID** (ID da Conta Business do Instagram)

### Pré-requisitos Obrigatórios:
- Ter uma **Página no Facebook**.
- Ter uma **Conta Profissional (Comercial ou Criador)** no Instagram.
- A conta do Instagram deve estar **vinculada** à Página do Facebook (feita pelo Instagram em *Configurações ➔ Compartilhar em outros aplicativos ➔ Facebook* ou pelo Meta Business Suite).

### Passo a Passo:
1. **Acesse o Meta for Developers:**
   - Acesse: [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
   - Clique em **"Criar aplicativo"** (Create App).
   - Selecione o tipo **"Outro"** ➔ selecione **"Empresa"** (Business).
   - Nome do aplicativo: `Social360 Publisher`.
2. **Adicionar Permissões de Publicação:**
   - Vá para o **Graph API Explorer**: [https://developers.facebook.com/tools/explorer/](https://developers.facebook.com/tools/explorer/)
   - Selecione o aplicativo criado.
   - Em **"User or Page"**, selecione a sua Página do Facebook.
   - Em **Permissões** (Permissions), adicione:
     - `pages_show_list`
     - `pages_read_engagement`
     - `pages_manage_posts`
     - `instagram_basic`
     - `instagram_content_publish`
   - Clique em **"Generate Access Token"** e autorize todas as permissões nas telas que o Facebook exibir.
3. **Obter o Page ID:**
   - No Graph API Explorer, faça uma requisição `GET` para: `me?fields=id,name`
   - O retorno trará o `id` da página (ex: `102938475610293`). Esse é o **Page ID**.
4. **Obter o Instagram Account ID:**
   - No Graph API Explorer, faça uma requisição `GET` para:
     `me?fields=instagram_business_account`
   - O resultado será algo como:
     ```json
     {
       "instagram_business_account": {
         "id": "17841400012345678"
       },
       "id": "102938475610293"
     }
     ```
   - O valor `17841400012345678` é o seu **Instagram Account ID**.
5. **Gerar Token de Longa Duração (Permanente / 60 dias):**
   - Por padrão, os tokens do Explorer expiram em algumas horas.
   - Acesse a ferramenta de Tokens de Acesso: [https://developers.facebook.com/tools/debug/accesstoken/](https://developers.facebook.com/tools/debug/accesstoken/)
   - Cole o token gerado e clique em **"Depurar"** ➔ role até o final e clique em **"Estender Token de Acesso"**.
   - Copie o token de longa duração gerado e cole no campo **Page Access Token** no Social360.

---

## 4. X / Twitter API (v2)
> Permite publicação automática de postagens e threads completas com divisão inteligente de caracteres.

### Campos Solicitados no Social360:
- **Bearer Token ou User Access Token**

### Passo a Passo:
1. **Acesse o X Developer Portal:**
   - Acesse: [https://developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard) (ou `developer.twitter.com`).
   - Faça login com a conta do X que irá publicar.
2. **Inscrever-se no Plano de Desenvolvedor:**
   - Se ainda não tiver cadastro de desenvolvedor, clique em **"Sign Up"** e selecione o plano **Free** (Gratuito - permite postagens via API v2) ou **Basic**.
   - Responda brevemente a finalidade de uso (ex: *Automação e publicação programada de conteúdos corporativos da nossa agência*).
3. **Criar um Projeto e Aplicativo:**
   - No menu lateral, vá em **Projects & Apps** ➔ **Overview**.
   - Clique em **"Add App"** ou crie um novo aplicativo.
   - Nomeie como `Social360 Studio`.
4. **Configurar Permissões de Escrita (Importante):**
   - Na página do seu App, vá na aba **"Settings"**.
   - Na seção **"User authentication settings"**, clique em **"Set up"**.
   - Em **App permissions**, marque obrigatoriamente: **Read and write** (Ler e Escrever).
   - Em **Type of App**, selecione **Web App**.
   - Em **Callback URI / Redirect URL**, preencha com a URL da sua aplicação (ex: `https://social360.anauedesign.com.br/`).
   - Salve as configurações.
5. **Gerar e Copiar o Token:**
   - Vá para a aba **"Keys and Tokens"**.
   - Na seção **Authentication Tokens**:
     - Gere o **Bearer Token** ou **OAuth 2.0 User Access Token**.
     - Copie a chave exibida e cole no campo **Bearer Token ou User Token** no Social360.

---

## 5. Telegram (Bot API)
> Permite disparo instantâneo das publicações em canais públicos/privados ou grupos do Telegram. É a integração mais rápida e fácil de configurar (leva menos de 2 minutos).

### Campos Solicitados no Social360:
- **Bot Token (do @BotFather)**
- **Chat ID ou @username_canal**

### Passo a Passo:
1. **Criar o Bot no Telegram:**
   - Abra o Telegram e pesquise pelo bot oficial: `@BotFather` (procure pelo selo azul de verificado).
   - Inicie a conversa e digite o comando: `/newbot`
   - Escolha um nome para o seu bot (ex: `Social360 Bot`).
   - Escolha um username que termine em `bot` (ex: `social360_pub_bot`).
   - O @BotFather enviará uma mensagem contendo o **HTTP API Token**, no formato:
     `7123456789:AAFlKj9823hjasd89123-kasd98123`
   - Copie esse código e cole no campo **Bot Token** no Social360.
2. **Adicionar o Bot como Administrador do Canal/Grupo:**
   - Abra o Canal ou Grupo no Telegram onde deseja que as publicações sejam postadas.
   - Vá em *Gerenciar Canal/Grupo ➔ Administradores ➔ Adicionar Administrador*.
   - Pesquise pelo username do bot que você acabou de criar (ex: `@social360_pub_bot`) e adicione-o com permissão para **Postar Mensagens** (Post Messages).
3. **Obter o Chat ID:**
   - **Se o canal for público:**
     Basta usar o próprio username público com `@`.  
     *Exemplo:* `@meucanalnoticias` ou `@anauedesign`
   - **Se o canal for privado ou for um Grupo:**
     1. Adicione temporariamente o bot `@RawDataBot` ou `@userinfobot` no seu canal/grupo.
     2. Ele enviará um JSON com as informações. O campo `chat` ➔ `id` é o seu Chat ID (começa geralmente com sinal de menos, ex: `-1001234567890`).
     3. Copie o número completo incluindo o `-100` e cole no campo **Chat ID** no Social360.

---

## 6. Webhooks (n8n, Make, Zapier, Metricool)
> O Webhook é o canal mais flexível de todos. Quando você clica em "Publicar nos Canais", o Social360 envia um pacote completo via requisição HTTP `POST` com os textos, imagens, metadados e tags para qualquer serviço de automação.

### Campos Solicitados no Social360:
- **URL do Webhook**

### Passo a Passo no n8n:
1. No seu fluxo do n8n, crie um nó do tipo **Webhook**.
2. Defina o método HTTP como **POST**.
3. Copie a **Production URL** (ex: `https://n8n.seu-dominio.com.br/webhook/social360-disparos`).
4. Cole no campo **URL do Webhook** no Social360.
5. Pronto! No n8n você pode direcionar o conteúdo para WhatsApp, Metricool, RdStation, WordPress ou qualquer outro destino.

### Passo a Passo no Make (antigo Integromat):
1. Crie um novo cenário e adicione o módulo inicial **Custom Webhook**.
2. Clique em *Add* e nomeie como `Social360 Disparo`.
3. Copie o endereço URL fornecido pelo Make e cole no campo **URL do Webhook** no Social360.

---

## 7. Chaves de Inteligência Artificial (LLM)
> Por padrão, a plataforma já vem com suporte a modelos globais. Caso um cliente queira usar sua própria cota ou modelo dedicado, você pode configurar na aba **"Inteligência Artificial"** do cliente:

| Provedor | Onde Obter a Chave de API | Modelo Recomendado |
| :--- | :--- | :--- |
| **Google Gemini** | [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | `gemini-2.5-flash` |
| **OpenAI** | [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `gpt-4o-mini` ou `gpt-4o` |
| **Anthropic Claude** | [https://console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | `claude-3-5-sonnet-20241022` |
| **Groq (Ultrarrápido)**| [https://console.groq.com/keys](https://console.groq.com/keys) | `llama-3.3-70b-versatile` |
| **Ollama (Local)** | *(Executado localmente na máquina ou VPS)* | `llama3` ou `mistral` |

---

## 8. Como Testar as Conexões no Painel

O Social360 conta com um sistema de **verificação de handshake e integridade em tempo real**:

1. No modal de edição do cliente, após preencher os dados de um canal, clique no botão específico de teste:
   - 🔘 **"Testar Conexão Telegram"**: envia uma chamada para a API oficial do Telegram e valida se o bot está ativo e com acesso ao chat.
   - 🔘 **"Testar Buffer"**: consulta a conta do Buffer e confirma se o token é válido.
   - 🔘 **"Testar LinkedIn"**: valida a autenticação na API v2.
   - 🔘 **"Testar X"**: consulta a rota `/users/me` da API do Twitter.
   - 🔘 **"Testar Meta"**: valida o token na Graph API do Facebook.
   - 🔘 **"Testar Webhook"**: dispara um ping de teste e aguarda status HTTP `200/204`.
2. Você também pode clicar no botão geral:
   👉 **🔌 Testar Todos os Canais Habilitados**
   O sistema testará todas as redes ativas em lote e exibirá um relatório visual com status verde (conectado) ou vermelho (com o motivo exato retornado pela rede social para facilitar a correção imediata).

---

## 🔒 Boas Práticas de Segurança
- **Nunca compartilhe seus tokens de API publicamente**: Eles concedem permissão para publicar em suas redes sociais.
- **Tokens do Social360**: Todos os dados salvos ficam restritos ao banco de dados interno da sua instância na VPS e não são expostos em formulários públicos ou repositórios abertos.
- **Caso suspeite de vazamento**: Acesse o painel de desenvolvedor da respectiva rede social e clique em *Revoke Token* ou *Regenerate Key* para invalidar o acesso antigo imediatamente.
