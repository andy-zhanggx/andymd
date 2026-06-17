FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching. @hocuspocus/extension-sqlite pulls
# better-sqlite3, which needs a toolchain to build its native binding.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY index.mjs ./

ENV PORT=1234
ENV COLLAB_DB=/data/andymd-collab.sqlite
VOLUME ["/data"]
EXPOSE 1234

CMD ["node", "index.mjs"]
