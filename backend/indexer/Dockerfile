FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

CMD ["node", "dist/index.js"]
