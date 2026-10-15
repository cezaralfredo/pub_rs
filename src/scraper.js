const cheerio = require('cheerio');

/**
 * Extrai dados estruturados de JSON-LD caso existam no documento HTML.
 */
function extractJsonLd($) {
  let articleData = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);

      for (const item of items) {
        const type = (item['@type'] || '').toString().toLowerCase();
        if (type.includes('article') || type.includes('blogposting') || type.includes('newsarticle')) {
          articleData = {
            title: item.headline || item.name,
            description: item.description,
            image: typeof item.image === 'string' ? item.image : (item.image?.url || (Array.isArray(item.image) ? item.image[0] : null)),
            datePublished: item.datePublished,
            author: typeof item.author === 'string' ? item.author : (item.author?.name || (Array.isArray(item.author) ? item.author[0]?.name : null)),
            bodyText: item.articleBody
          };
          break;
        }
      }
    } catch {
      // Ignora JSON-LD com sintaxe inválida
    }
  });
  return articleData;
}

/**
 * Extrai e estrutura os dados de um artigo da web a partir da URL.
 */
async function scrapeArticle(targetUrl) {
  try {
    // Validação básica da URL
    const urlObj = new URL(targetUrl);

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PubRS/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!res.ok) {
      throw new Error(`Falha ao acessar URL (${res.status} ${res.statusText})`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Tentar extrair do JSON-LD
    const jsonLd = extractJsonLd($);

    // 1. Extração e Higienização de Metadados
    const rawTitle = jsonLd.title ||
                     $('meta[property="og:title"]').attr('content') ||
                     $('meta[name="twitter:title"]').attr('content') ||
                     $('title').text() ||
                     $('h1').first().text() ||
                     '';
    // Remove sufixos como "| Nome do Blog" ou "- Nome da Empresa"
    const cleanTitle = rawTitle.replace(/\s*[-|–—]\s*[^–—|-]+$/, '').trim();

    const description = jsonLd.description ||
                        $('meta[property="og:description"]').attr('content') ||
                        $('meta[name="twitter:description"]').attr('content') ||
                        $('meta[name="description"]').attr('content') ||
                        '';

    let imageUrl = jsonLd.image ||
                   $('meta[property="og:image"]').attr('content') ||
                   $('meta[property="og:image:secure_url"]').attr('content') ||
                   $('meta[name="twitter:image"]').attr('content') ||
                   $('meta[name="twitter:image:src"]').attr('content') ||
                   $('article img, main img, .post-body img, .entry-content img').first().attr('src') ||
                   '';

    // Normaliza URL relativa de imagem para absoluta
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = new URL(imageUrl, urlObj.origin).toString();
    }

    const canonicalUrl = $('meta[property="og:url"]').attr('content') ||
                         $('link[rel="canonical"]').attr('href') ||
                         targetUrl;

    const siteName = $('meta[property="og:site_name"]').attr('content') ||
                     $('meta[name="application-name"]').attr('content') ||
                     urlObj.hostname.replace(/^www\./, '');

    // 2. Extração de Tópicos (Headings H2/H3)
    const headings = [];
    $('article h2, main h2, .post-body h2, .entry-content h2, article h3, main h3, h2').each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();
      const isNoise = lower.includes('comentário') ||
                      lower.includes('navega') ||
                      lower.includes('compartilhe') ||
                      lower.includes('artigos relacionad') ||
                      lower.includes('posts relacionad') ||
                      lower.includes('sobre o autor');
      if (txt && txt.length > 5 && txt.length < 140 && !headings.includes(txt) && !isNoise) {
        headings.push(txt);
      }
    });

    // 3. Extração de Parágrafos Relevantes
    const paragraphs = [];
    $('article p, main p, .post-body p, .entry-content p').each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      const lower = txt.toLowerCase();
      const isNoise = lower.includes('todos os direitos') ||
                      lower.includes('política de privacidade') ||
                      lower.includes('termos de uso') ||
                      lower.includes('usamos cookies') ||
                      lower.includes('newsletter');
      if (txt.length >= 45 && !isNoise) {
        paragraphs.push(txt);
      }
    });

    // 4. Extração de Listas / Bullets
    const bulletPoints = [];
    $('article ul li, .post-body ul li, .entry-content ul li, article ol li').each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (txt.length >= 15 && txt.length <= 250 && !bulletPoints.includes(txt)) {
        bulletPoints.push(txt);
      }
    });

    // 5. Slug amigável
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'artigo';
    const slug = lastPart
      .replace(/\.html?$/i, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'artigo';

    return {
      url: targetUrl,
      canonicalUrl,
      slug,
      title: cleanTitle || 'Artigo sem Título',
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      siteName,
      author: jsonLd.author || null,
      datePublished: jsonLd.datePublished || null,
      headings: headings.slice(0, 10),
      paragraphs: paragraphs.slice(0, 12),
      bulletPoints: bulletPoints.slice(0, 10),
      fullTextSnippet: jsonLd.bodyText ? jsonLd.bodyText.slice(0, 1500) : paragraphs.slice(0, 6).join('\n\n')
    };
  } catch (error) {
    throw new Error(`Erro no scraper (${targetUrl}): ${error.message}`);
  }
}

module.exports = { scrapeArticle };
