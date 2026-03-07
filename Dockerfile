FROM node:20-alpine

# Instala ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn prisma generate
RUN yarn build

EXPOSE 4000

CMD ["yarn", "start:prod:migrate"]
