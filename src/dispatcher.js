const fs = require('fs');
const path = require('path');

async function exportAndDispatch({ article, client, copies, images, outputDir }) {
  const copysDir = path.join(outputDir, 'copys');
  if (!fs.existsSync(copysDir)) {
    fs.mkdirSync(copysDir, { recursive: true });
  }

  // 1. Salvar arquivos individuais de texto para cópia direta
  fs.writeFileSync(path.join(copysDir, 'linkedin.txt'), copies.linkedin.post, 'utf8');
  fs.writeFileSync(path.join(copysDir, 'instagram_feed.txt'), copies.instagram.post, 'utf8');
  fs.writeFileSync(path.join(copysDir, 'instagram_stories.txt'), copies.stories.post, 'utf8');
  fs.writeFileSync(path.join(copysDir, 'twitter_thread.txt'), copies.twitter.thread.join('\n\n---\n\n'), 'utf8');
  fs.writeFileSync(path.join(copysDir, 'threads.txt'), copies.threads.post, 'utf8');
  fs.writeFileSync(path.join(copysDir, 'facebook.txt'), copies.facebook.post, 'utf8');

  // Primeiro comentário separado
  const firstCommentsTxt = 
`=== PRIMEIROS COMENTÁRIOS OFICIAIS ===

[LINKEDIN - 1º COMENTÁRIO]:
${copies.linkedin.firstComment}

[INSTAGRAM - 1º COMENTÁRIO]:
${copies.instagram.firstComment}
`;
  fs.writeFileSync(path.join(copysDir, 'primeiros_comentarios.txt'), firstCommentsTxt, 'utf8');

  // 2. Montar Relatório Markdown Executivo
  const generatorName = copies.meta?.generator || 'pub_rs Engine';
  const reportMd = 
`# 📦 Pacote de Distribuição Multicanal · pub_rs

**Artigo Base:** [${article.title}](${article.canonicalUrl || article.url})  
**Cliente:** ${client.name || client.brandName} (${client.id || 'default'})  
**Motor de Redação:** ${generatorName}  
**Data de Geração:** ${new Date().toLocaleString('pt-BR')}  

---

## 🖼️ Mídias Processadas por Rede

| Rede Social | Formato Recomendado | Dimensões | Arquivo Gerado |
| :--- | :--- | :--- | :--- |
| **Instagram Feed** | Retrato 4:5 | 1080 x 1350 px | \`images/instagram_feed_portrait_4x5.webp\` |
| **LinkedIn / X / Facebook** | Horizontal 16:9 | 1200 x 675 px | \`images/linkedin_twitter_facebook_16x9.webp\` |
| **Instagram Stories / Status** | Vertical 9:16 | 1080 x 1920 px | \`images/instagram_stories_reels_9x16.webp\` |
| **Threads / Feed Quadrado** | Quadrado 1:1 | 1080 x 1080 px | \`images/instagram_threads_square_1x1.webp\` |

---

## 💼 1. LinkedIn

\`\`\`text
${copies.linkedin.post}
\`\`\`

**Primeiro Comentário:**
> ${copies.linkedin.firstComment}

---

## 📸 2. Instagram (Feed)

\`\`\`text
${copies.instagram.post}
\`\`\`

**Primeiro Comentário:**
> ${copies.instagram.firstComment}

---

## ⚡ 3. Instagram Stories

\`\`\`text
${copies.stories.post}
\`\`\`

---

## 🐦 4. X (Twitter) - Fio / Thread

${copies.twitter.thread.map((t, idx) => `### Tweet ${idx + 1}\n\`\`\`text\n${t}\n\`\`\``).join('\n\n')}

---

## 🧵 5. Threads

\`\`\`text
${copies.threads.post}
\`\`\`

---

## 👥 6. Facebook

\`\`\`text
${copies.facebook.post}
\`\`\`
`;

  fs.writeFileSync(path.join(outputDir, 'PACOTE_REDES_SOCIAIS.md'), reportMd, 'utf8');

  // 3. Payload JSON consolidado (API / Webhook / Integrações)
  const payload = {
    client: client.id || 'default',
    brand: client.brandName || client.name,
    article: {
      title: article.title,
      description: article.description,
      url: article.canonicalUrl || article.url,
      slug: article.slug,
      siteName: article.siteName
    },
    images,
    copies,
    generatedAt: new Date().toISOString()
  };

  fs.writeFileSync(path.join(outputDir, 'payload.json'), JSON.stringify(payload, null, 2), 'utf8');

  // 4. Se houver Webhook cadastrado (no cliente ou no .env), enviar automaticamente
  let webhookResult = null;
  const webhookUrl = client.webhookUrl || process.env.DEFAULT_WEBHOOK_URL;

  if (webhookUrl && webhookUrl.startsWith('http')) {
    try {
      console.log(`\n🌐 [DISPATCH] Enviando payload para webhook: ${webhookUrl}`);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      webhookResult = { status: res.status, ok: res.ok };
      console.log(`   ✓ Webhook disparado com status ${res.status}`);
    } catch (err) {
      console.error(`   ⚠️ Falha no webhook (${webhookUrl}):`, err.message);
      webhookResult = { error: err.message };
    }
  }

  return {
    outputDir,
    copysDir,
    webhookResult
  };
}

module.exports = { exportAndDispatch };
