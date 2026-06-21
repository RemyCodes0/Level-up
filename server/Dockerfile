# Dockerfile for the Level Up backend — needed because Render's standard
# Node environment doesn't allow installing system packages, and Remotion's
# server-side video rendering requires Chrome's Linux shared libraries to be
# present on the OS, not just npm packages.

FROM node:20-bookworm

WORKDIR /usr/src/app

# Install the shared libraries Chrome Headless Shell needs to launch.
# Exact list from Remotion's own docs: https://www.remotion.dev/docs/miscellaneous/linux-dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libgbm-dev \
    libcups2 \
    libcairo2 \
    libpango-1.0-0 \
    libatk-bridge2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

# Pre-download Chrome Headless Shell at build time, so the first real
# render doesn't have to download it (and risk timing out) — this is what
# Remotion recommends for server-side rendering deployments.
RUN npx remotion browser ensure

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]