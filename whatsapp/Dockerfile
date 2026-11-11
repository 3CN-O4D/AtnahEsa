FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 10000
ENV PORT=10000
CMD ["node", "index.mjs"]
