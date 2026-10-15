const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processSocialImages(imageUrl, outputDir) {
  try {
    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    let inputBuffer;

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        throw new Error(`Falha ao baixar imagem: ${res.statusText}`);
      }
      inputBuffer = Buffer.from(await res.arrayBuffer());
    } else if (fs.existsSync(imageUrl)) {
      inputBuffer = fs.readFileSync(imageUrl);
    } else {
      console.warn(`[AVISO] Imagem não encontrada: ${imageUrl}. Gerando imagem padrão.`);
      inputBuffer = await sharp({
        create: {
          width: 1200,
          height: 675,
          channels: 3,
          background: { r: 10, g: 17, b: 40 }
        }
      }).jpeg().toBuffer();
    }

    const formats = [
      {
        name: 'linkedin_twitter_facebook_16x9',
        width: 1200,
        height: 675,
        desc: 'Horizontal 16:9 (Ideal para LinkedIn, X/Twitter e Facebook)'
      },
      {
        name: 'instagram_feed_portrait_4x5',
        width: 1080,
        height: 1350,
        desc: 'Vertical 4:5 (Padrão ouro do Feed do Instagram - maior retenção de tela)'
      },
      {
        name: 'instagram_threads_square_1x1',
        width: 1080,
        height: 1080,
        desc: 'Quadrado 1:1 (Feed quadrado do Instagram, Threads e posts móveis)'
      },
      {
        name: 'instagram_stories_reels_9x16',
        width: 1080,
        height: 1920,
        desc: 'Vertical 9:16 (Stories do Instagram, WhatsApp Status e capa de Reels)'
      }
    ];

    const results = [];

    for (const fmt of formats) {
      const baseName = fmt.name;
      const webpPath = path.join(imagesDir, `${baseName}.webp`);
      const jpgPath = path.join(imagesDir, `${baseName}.jpg`);

      // Processamento inteligente com Sharp
      if (fmt.height > fmt.width) {
        // Formato vertical (4:5 ou 9:16) a partir de 16:9:
        // Cria fundo estendido/blur elegante para não cortar o conteúdo principal
        const background = await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover' })
          .blur(25)
          .modulate({ brightness: 0.65 })
          .toBuffer();

        const mainOverlay = await sharp(inputBuffer)
          .resize(fmt.width, Math.round(fmt.width * (9 / 16)), { fit: 'contain' })
          .toBuffer();

        await sharp(background)
          .composite([{ input: mainOverlay, gravity: 'center' }])
          .webp({ quality: 90 })
          .toFile(webpPath);

        await sharp(background)
          .composite([{ input: mainOverlay, gravity: 'center' }])
          .jpeg({ quality: 90 })
          .toFile(jpgPath);

      } else {
        // Formatos horizontais e quadrados
        await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover', position: 'center' })
          .webp({ quality: 90 })
          .toFile(webpPath);

        await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 90 })
          .toFile(jpgPath);
      }

      results.push({
        format: fmt.name,
        width: fmt.width,
        height: fmt.height,
        description: fmt.desc,
        files: {
          webp: webpPath,
          jpg: jpgPath
        }
      });
    }

    return results;
  } catch (error) {
    throw new Error(`Erro no processamento de imagens: ${error.message}`);
  }
}

module.exports = { processSocialImages };
