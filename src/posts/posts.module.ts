import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PrismaService } from 'src/databases/prisma/prisma.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EmailService } from 'src/notification/email.service';
import { AwsUploadModule } from 'src/aws/aws.module';
import { ConfigModule } from '@nestjs/config';
import { NotificationListener } from 'src/notification/notification.listener';
import { PushService } from 'src/notification/push.service';

@Module({
  imports: [EventEmitterModule.forRoot(), AwsUploadModule, ConfigModule],
  controllers: [PostsController],
  providers: [
    PostsService,
    PrismaService,
    NotificationListener,
    EmailService,
    PushService,
  ],
})
export class PostsModule {}
