# Mural de Fotos Backend

API backend do Mural de Fotos, construída com NestJS, Prisma e PostgreSQL. O sistema gerencia usuários, autenticação, posts com múltiplas mídias, curtidas, comentários, marcação de usuários, detecção/rotulagem de faces, stories retrospectivos e notificações por e-mail e push.

## Stack

- Node.js 20
- NestJS 11
- TypeScript
- Prisma ORM
- PostgreSQL com extensão `pgvector`
- AWS S3 para armazenamento público de mídias
- Resend para envio de e-mails
- Expo Push Notifications
- Sharp e FFmpeg para otimização de imagens, vídeos e thumbnails
- Swagger/OpenAPI
- Zod via `nestjs-zod` para validação e serialização

## Principais recursos

- Cadastro, listagem, atualização e remoção de usuários.
- Login com JWT e proteção global de rotas autenticadas.
- Recuperação e redefinição de senha por código enviado por e-mail.
- Upload avulso de imagem para S3.
- Criação de posts com upload multipart de até 10 imagens/vídeos.
- Otimização de imagens e vídeos antes do upload.
- Geração de thumbnail para vídeos.
- Posts públicos e privados, com paginação, ordenação e busca.
- Marcação manual de usuários em posts.
- Curtidas e comentários com notificações.
- Integração com serviço externo de detecção facial.
- Agrupamento de faces por embeddings usando `pgvector`.
- Rotulagem de clusters/faces com usuário ou nome.
- Stories retrospectivos trimestrais/anuais e retrospectiva global.
- Lembretes automáticos de memória por cron.

## Estrutura

```text
src/
  app.module.ts                  # módulos globais, guards, pipes e interceptors
  main.ts                        # bootstrap, CORS, prefixo global, Swagger e porta 4000
  auths/                         # login, JWT, local strategy e guards
  users/                         # usuários, recuperação de senha e tokens push
  posts/                         # posts, mídia, busca, thumbnails e startup reprocessing
  likes/                         # curtidas em posts
  comments/                      # comentários em posts
  aws/                           # upload para S3
  labeling/                      # detecção facial, clusters e rotulagem
  stories/                       # geração e consulta de stories retrospectivos
  notification/                  # e-mail, push e listeners de eventos
  common/                        # pipes, filtros, interceptors e decorators
  databases/prisma/              # PrismaService
prisma/
  schema.prisma                  # modelos e relações do banco
  migrations/                    # migrations versionadas
```

## Requisitos

- Node.js 20 ou compatível
- Yarn 1.x
- Docker e Docker Compose, recomendado para banco local
- FFmpeg instalado no ambiente local se rodar fora do Docker
- Bucket S3 com permissão de escrita e leitura pública dos objetos enviados
- Chave do Resend para fluxos de e-mail
- Serviço externo compatível com `POST /detect-faces` se usar detecção facial

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto. Exemplo para desenvolvimento:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nestdb"
JWT_SECRET="troque-este-segredo"
ROUTE=""

AWS_REGION="us-east-1"
AWS_ACCESS_KEY="sua-access-key"
AWS_SECRET_KEY="sua-secret-key"
AWS_PUBLIC_BUCKET_NAME="seu-bucket-publico"

RESEND_API_KEY="re_xxxxxxxxx"
POST_CREATED_WEBHOOK_URL="http://localhost:8000"
```

Notas:

- `ROUTE` é opcional e define um prefixo global para a API. Se `ROUTE=/api`, a documentação fica em `/api/docs`.
- `JWT_SECRET` tem fallback para `secret` no código, mas deve ser definido em qualquer ambiente real.
- `POST_CREATED_WEBHOOK_URL` é usado como `baseURL` do cliente HTTP que chama `/detect-faces`.
- O `docker-compose.yml` sobrescreve `DATABASE_URL` dentro do container da API para apontar para o serviço `database`.

## Instalação local

```bash
yarn install
```

Suba o banco local:

```bash
docker compose up -d database
```

Gere o Prisma Client e aplique as migrations:

```bash
yarn prisma generate
yarn prisma migrate deploy
```

Inicie em modo desenvolvimento:

```bash
yarn start:dev
```

A API escuta em:

```text
http://localhost:4000
```

Swagger:

```text
http://localhost:4000/docs
```

OpenAPI JSON:

```text
http://localhost:4000/swagger/json
```

## Rodando com Docker

Para subir API e banco:

```bash
docker compose up --build
```

Serviços:

- API: `http://localhost:4000`
- PostgreSQL/pgvector: `localhost:5432`

O container da API executa:

```bash
yarn prisma migrate deploy && yarn start:prod
```

## Scripts

```bash
yarn build          # compila a aplicação Nest
yarn start          # inicia a aplicação
yarn start:dev      # inicia com watch mode
yarn start:prod     # executa dist/src/main
yarn start:prod:migrate
yarn lint           # eslint com --fix
yarn format         # prettier em src e test
yarn test           # testes unitários
yarn test:e2e       # testes e2e
yarn test:cov       # cobertura
```

## Banco de dados

O Prisma modela as principais entidades:

- `User`: usuário, perfil, senha, tokens push e relações sociais.
- `PushToken`: tokens Expo por usuário e plataforma.
- `Post`: publicação com legenda, visibilidade, thumbnail, autor e usuários marcados.
- `Media`: imagens/vídeos de um post, com ordenação e status de processamento.
- `Entity`: face detectada, bounding box, embedding vetorial e vínculo com mídia/cluster/usuário.
- `EntityCluster`: agrupamento de faces por similaridade.
- `Comment` e `Like`: interações em posts.
- `Story` e `StoryItem`: retrospectivas temporárias com mídias ordenadas.

O banco precisa suportar `vector`, usado nos campos `embedding` e `centroidEmbedding`.

## Autenticação

A API usa JWT Bearer. O `JwtAuthGuard` é global, então as rotas são privadas por padrão. Rotas públicas usam o decorator `@Public()`.

Fluxo básico:

1. Crie um usuário em `POST /users`.
2. Faça login em `POST /auths/login`.
3. Envie o token retornado no header:

```http
Authorization: Bearer <accessToken>
```

Observação: o DTO aceita `identifier` como e-mail, CPF ou CNPJ, mas a implementação atual consulta usuário por e-mail.

## Endpoints

### Auth

- `POST /auths/login`: autentica usuário e retorna `accessToken`.

### Users

- `POST /users`: cria usuário. Público.
- `GET /users`: lista usuários com paginação e filtro por nome. Público.
- `GET /users/:id`: busca usuário por ID. Público.
- `PATCH /users/me`: atualiza usuário autenticado e pode registrar token Expo.
- `DELETE /users/me`: remove usuário autenticado.
- `POST /users/recover-password`: gera código de recuperação e envia e-mail. Público.
- `POST /users/reset-password`: redefine senha com código. Público.

### Posts

- `POST /posts`: cria post autenticado via `multipart/form-data`.
- `GET /posts`: lista posts com paginação, filtros e busca. Público.
- `GET /posts/:id`: busca post por ID. Público.
- `PATCH /posts/:id`: atualiza post.
- `DELETE /posts/:id`: remove post.

Campos aceitos na criação:

- `caption`: legenda.
- `public`: boolean.
- `taggedUserIds`: array de UUIDs dos usuários marcados.
- `media`: arquivos de imagem/vídeo, até 10 arquivos.

A busca de posts considera legenda, nome do autor, usuários marcados e informações de entidades/faces reconhecidas.

### Likes

- `POST /posts/:id/like`: curte um post.
- `DELETE /posts/:id/like`: remove curtida.
- `GET /posts/:postId/liked`: verifica se o usuário autenticado curtiu o post.

### Comments

- `POST /posts/:id/comments`: cria comentário.
- `GET /posts/:id/comments`: lista comentários do post.

### Upload

- `POST /upload`: envia uma imagem avulsa para S3 usando campo `image`.

Campo opcional:

- `folder`: pasta/chave lógica dentro do bucket, como `avatars` ou `posts`.

### Labeling

- `GET /labeling`: lista clusters/entities com paginação e filtros.
- `POST /labeling/label`: rotula um cluster com `userId` ou `name`.
- `POST /labeling/entity/:entityId/cluster/:clusterId`: adiciona entity a um cluster.
- `DELETE /labeling/entity/:entityId/cluster`: remove entity do cluster.

### Stories

- `GET /stories`: lista stories ativos visíveis para o usuário autenticado.
- `GET /stories/:id`: retorna story com mídias ordenadas.

## Eventos e jobs

A aplicação usa `@nestjs/event-emitter` para desacoplar fluxos internos:

- `post.created`: dispara processamento facial e notificação de nova publicação.
- `comment.created`: envia e-mail e push ao autor do post.
- `post.liked`: envia push ao autor do post.
- `post.users_tagged`: envia push aos usuários marcados.
- `face.detected`: envia e-mail e push quando uma face reconhecida aparece em uma mídia.
- `password.reset`: envia e-mail de recuperação de senha.
- `post.memory_reminder`: envia push de lembrança.

Jobs agendados:

- Stories: geração e limpeza diária às 11:00 em `America/Porto_Velho`.
- Lembretes de memória: execução diária às 11:00 em `America/Porto_Velho`.

Serviços de startup:

- `PostsStartupService`: reprocessa posts antigos com thumbnail ausente ou pendente.
- `StoriesService`: tenta gerar/limpar stories na inicialização.
- `LabelStartup`: inicializa processamento relacionado à rotulagem quando aplicável.

## Processamento de mídia e faces

Ao criar um post:

1. O backend valida se os arquivos são imagens ou vídeos.
2. Imagens são convertidas/otimizadas com `sharp`.
3. Vídeos são reencodados com `ffmpeg`.
4. A primeira mídia define a thumbnail do post.
5. Os arquivos são enviados para S3.
6. O evento `post.created` aciona o processamento das imagens.
7. Para imagens, a API baixa a mídia e envia para `POST /detect-faces` no serviço externo.
8. As faces retornadas são persistidas como `Entity` e agrupadas em `EntityCluster` via similaridade vetorial.
9. Se o cluster já estiver vinculado a um usuário, a aplicação notifica esse usuário.

## Notificações

E-mail:

- comentários em posts;
- recuperação de senha;
- face detectada em nova foto.

Push Expo:

- novo comentário;
- novo like;
- nova publicação;
- usuário marcado em post;
- face detectada;
- lembrete de memória;
- stories retrospectivos.

Tokens Expo são registrados em `PATCH /users/me` usando os campos `token` e `platform`, onde `platform` deve ser `IOS` ou `ANDROID`.

## Testes

Rodar todos os testes:

```bash
yarn test
```

Rodar teste específico de posts:

```bash
yarn test posts.service.spec.ts
```

Rodar build:

```bash
yarn build
```

## Observações de desenvolvimento

- A aplicação sempre escuta na porta `4000`.
- O diretório `images/` é criado no bootstrap e montado no Docker Compose, embora os uploads principais sejam enviados para S3.
- As rotas públicas dependem do decorator `@Public()`. Novas rotas são privadas por padrão.
- Migrations devem ser versionadas em `prisma/migrations`.
- Após alterações no Prisma, rode `yarn prisma generate`.
- Em produção, prefira `yarn prisma migrate deploy` em vez de `migrate dev`.
