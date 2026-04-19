import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StoryDto, StoryListDto } from './dto/story.dto';
import { StoriesService } from './stories.service';

@ApiTags('Stories')
@Controller('stories')
@ApiBearerAuth('JWT-auth')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os stories ativos visíveis para o usuário autenticado',
    operationId: 'listStories',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de stories disponíveis',
    type: StoryListDto,
  })
  async findAll(@Req() req) {
    return this.storiesService.findAvailableStories(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Retorna um story específico com todas as mídias ordenadas',
    operationId: 'getStoryById',
  })
  @ApiResponse({
    status: 200,
    description: 'Story detalhado',
    type: StoryDto,
  })
  async findOne(@Req() req, @Param('id') id: string) {
    return this.storiesService.findStoryById(req.user.id, id);
  }
}
