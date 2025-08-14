import { Controller, Post, Body, Get, Param, Logger } from '@nestjs/common';
import { FaucetService } from './faucet.service';
import { FaucetRequestDto } from '../common/dto/faucet-request.dto';

@Controller('faucet')
export class FaucetController {
  private readonly logger = new Logger(FaucetController.name);

  constructor(private readonly faucetService: FaucetService) {}

  @Post()
  async requestFaucet(@Body() faucetRequest: FaucetRequestDto) {
    this.logger.log(`Received faucet request from ${faucetRequest.username}`);

    try {
      const result =
        await this.faucetService.processFaucetRequest(faucetRequest);
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
}
