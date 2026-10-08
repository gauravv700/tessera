import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { SYMBOLS } from '../common/units';
import { AiService } from './ai.service';

class ChatDto {
  @IsString() @MaxLength(1000) question: string;
  @IsOptional() @IsIn(Object.keys(SYMBOLS)) symbol?: string;
}
class SentimentDto { @IsString() @MaxLength(5000) text: string }

@Controller('ai')
@UseGuards(JwtGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } }) // LLM calls are expensive
export class AiController {
  constructor(private ai: AiService) {}

  @Post('chat') chat(@Body() b: ChatDto) { return this.ai.chat(b.question, b.symbol); }
  @Post('sentiment') sentiment(@Body() b: SentimentDto) { return this.ai.sentiment(b.text); }
  @Get('signal') signal(@Query('symbol') symbol: string) {
    if (!SYMBOLS[symbol]) throw new BadRequestException('unknown symbol');
    return this.ai.signal(symbol);
  }
}
