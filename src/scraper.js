const cheerio = require('cheerio');

async function scrapeArticle(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PubRS/1.0'
      }
    });

    if (!res.ok) {
      throw new Error(`Falha ao acessar URL (${res.status} ${res.statusText})`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. Extração de Metadados
    const rawTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || $('h1').first().text();
    const cleanTitle = rawTitle.replace(/\s*\|\s*.*$/, '').trim();

    const description = $('meta[property="og:description"]').attr('content') ||
                        $('meta[name="description"]').attr('content') || '';

    let imageUrl = $('meta[property="og:image"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('article img').first().attr('src') || '';

    if (imageUrl && !imageUrl.startsWith('http')) {
      const baseUrl = new URL(targetUrl);
      imageUrl = new URL(imageUrl, baseUrl.origin).toString();
    }

    const canonicalUrl = $('meta[property="og:url"]').attr('content') ||
                         $('link[rel="canonical"]').attr('href') ||
                         targetUrl;

    const siteName = $('meta[property="og:site_name"]').attr('content') || '';

    // 2. Extração de Tópicos e Conteúdo
    const headings = [];
    $('article h2, main h2, .post-body h2, h2').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && !headings.includes(txt) && !txt.toLowerCase().includes('comentário') && !txt.toLowerCase().includes('navega')) {
        headings.push(txt);
      }
    });

    const paragraphs = [];
    $('article p, main p, .post-body p').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.length > 50 && !txt.toLowerCase().includes('todos os direitos') && !txt.toLowerCase().includes('cookie')) {
        paragraphs.push(txt);
      }
    });

    const bulletPoints = [];
    $('article ul li, .post-body ul li, article ol li').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.length > 20 && txt.length < 250) {
        bulletPoints.push(txt);
      }
    });

    // 3. Slug da URL
    const urlObj = new URL(targetUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'artigo';
    const slug = lastPart.replace(/\.html?$/, '').replace(/[^a-zA-Z0-9-_]/g, '');

    return {
      url: targetUrl,
      canonicalUrl,
      slug,
      title: cleanTitle,
      description: description.trim(),
      imageUrl,
      siteName,
      headings: headings.slice(0, 8),
      paragraphs: paragraphs.slice(0, 10),
      bulletPoints: bulletPoints.slice(0, 8),
      fullTextSnippet: paragraphs.slice(0, 5).join('\n\n')
    };
  } catch (error) {
    throw new Error(`Erro no scraper: ${error.message}`);
  }
}

module.exports = { scrapeArticle };
