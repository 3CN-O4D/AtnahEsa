FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# ffmpeg turns Edge TTS MP3 into WhatsApp OGG/Opus voice notes; DejaVu is what
# sharp uses to draw the marketing cards.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 10000
ENV PORT=10000
CMD ["node", "index.mjs"]
