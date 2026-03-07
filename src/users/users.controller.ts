import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUserDto } from './dto/get-user.dto';
import { Public } from 'src/common/decorators/public-endpoint.decorator';

// Importa os novos DTOs
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Users')
@Controller('users')
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Public()
  @ApiOperation({
    summary: 'Create a new user',
    operationId: 'createUser',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
    type: GetUserDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Retrieve a specific user by ID',
    operationId: 'getUserById',
  })
  @ApiResponse({
    status: 200,
    description: 'User data',
    type: GetUserDto,
  })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List all users with pagination and filters',
    operationId: 'listAllUsers',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limit per page',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    type: String,
    description: 'Filter by name',
  })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    enum: ['createdAt', 'name', 'email'],
    description: 'Order field',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Order direction',
  })
  async findAll(@Req() req, @Query() rawQuery: any) {
    const query: any = {
      page: Number(rawQuery.page) || 1,
      limit: Number(rawQuery.limit) || 10,
      orderBy: rawQuery.orderBy || 'createdAt',
      order: rawQuery.order || 'desc',
      name: rawQuery.name,
    };

    return this.usersService.findAll(query);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update the current logged user',
    operationId: 'updateCurrentUser',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully updated',
    type: GetUserDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(@Req() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Delete('me')
  @ApiOperation({
    summary: 'Delete the current logged user',
    operationId: 'deleteCurrentUser',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully deleted',
    type: GetUserDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Req() req) {
    return this.usersService.remove(req.user.id);
  }

  @Post('recover-password')
  @Public()
  @ApiOperation({
    summary: 'Request a password recovery',
    operationId: 'recoverPassword',
  })
  @ApiResponse({
    status: 200,
    description: 'Recovery e-mail sent if user exists',
  })
  async recoverPassword(@Body() recoverPasswordDto: RecoverPasswordDto) {
    return this.usersService.recoverPassword(recoverPasswordDto.email);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({
    summary: 'Reset password using recovery code',
    operationId: 'resetPassword',
  })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.usersService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.code,
      resetPasswordDto.newPassword,
    );
  }
}
