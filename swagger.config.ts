import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { cleanupOpenApiDoc } from 'nestjs-zod';

const configSwagger = new DocumentBuilder()
  .setTitle('API')
  .setDescription('')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Please enter a valid JWT token',
    },
    'JWT-auth',
  )
  .build();

function setupSwagger(app: INestApplication) {
  const document = SwaggerModule.createDocument(app, configSwagger);
  const path = process.env.ROUTE || '';
  const cleaned = cleanupOpenApiDoc(document);

  SwaggerModule.setup(`${path}/docs`, app, cleaned, {
    jsonDocumentUrl: `${path}/swagger/json`,
    customSiteTitle: 'API',
  });
}

export default setupSwagger;
