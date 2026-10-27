FROM node:20-slim

# Instalar dependências necessárias para sharp e utilitários
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm install --omit=dev

# Copiar código-fonte da aplicação
COPY . .

# Garantir existência das pastas de persistência
RUN mkdir -p /app/data /app/output /app/config/clients

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "server.js"]
