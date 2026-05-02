FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /data
ENV SQLITE_PATH=/data/blog.db
ENV SESSION_SECRET=change-me-in-production
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "app.js"]
