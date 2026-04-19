import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/databases/prisma/prisma.module';
import { PushService } from 'src/notification/push.service';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [PrismaModule],
  controllers: [StoriesController],
  providers: [StoriesService, PushService],
  exports: [StoriesService],
})
export class StoriesModule {}
