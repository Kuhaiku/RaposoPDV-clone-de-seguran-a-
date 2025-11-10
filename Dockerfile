# Estágio 1: Base da Imagem
# Usamos uma imagem oficial do Node.js baseada em Alpine Linux, que é leve e segura.
FROM node:20-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências do backend primeiro para aproveitar o cache do Docker
COPY backend/package*.json ./

# Instala apenas as dependências de produção, ignorando as de desenvolvimento (como o nodemon)
RUN npm install --production

# Copia todo o código do backend para o container
COPY backend/ .

# Copia todo o código do frontend para uma pasta 'frontend' dentro do container
COPY frontend/ ./frontend/

# Expõe a porta que a nossa aplicação usa
EXPOSE 3000

# Comando final para iniciar o servidor Node.js quando o container for executado
CMD ["node", "src/server.js"]