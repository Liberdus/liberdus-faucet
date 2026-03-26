import { Controller, Post, Body, Get, Param, Logger, Req } from '@nestjs/common';
import { Request } from 'express';
import { FaucetService } from './faucet.service';
import { FaucetRequestDto } from '../common/dto/faucet-request.dto';

@Controller('faucet')
export class FaucetController {
  private readonly logger = new Logger(FaucetController.name);

  constructor(private readonly faucetService: FaucetService) {}

  @Post()
  async requestFaucet(
    @Body() faucetRequest: FaucetRequestDto,
    @Req() request: Request,
  ) {
    const clientIp = this.getClientIp(request);
    this.logger.log(
      `Received faucet request from ${faucetRequest.username} at IP ${clientIp}`,
    );

    try {
      const result =
        await this.faucetService.processFaucetRequest(faucetRequest, clientIp);
      return result;
    } catch (error) {
      this.logger.error('Error processing faucet request:', error);
      throw error;
    }
  }

  @Get('stats')
  getFaucetStats() {
    return this.faucetService.getFaucetStats();
  }

  @Get('request/:id')
  getRequest(@Param('id') requestId: string) {
    const request = this.faucetService.getRequest(requestId);
    if (!request) {
      return { error: 'Request not found' };
    }
    return request;
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'liberdus-faucet',
    };
  }

  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0].split(',')[0].trim();
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
