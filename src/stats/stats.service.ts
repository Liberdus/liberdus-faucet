import { Injectable, Logger } from '@nestjs/common';
import { FaucetRequest } from './interfaces/faucet-request.interface';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private readonly requests: Map<string, FaucetRequest> = new Map();

  createRequest(
    nodeAddress: string,
    username: string,
    userAddress: string,
    amount: number,
  ): FaucetRequest {
    const id = this.generateRequestId();
    const request: FaucetRequest = {
      id,
      nodeAddress,
      username,
      userAddress,
      amount,
      status: 'pending',
      timestamp: new Date(),
    };

    this.requests.set(id, request);
    this.logger.log(`Created faucet request ${id} for user ${username}`);

    return request;
  }

  updateRequestStatus(
    id: string,
    status: 'completed' | 'failed',
    txHash?: string,
    error?: string,
  ): void {
    const request = this.requests.get(id);
    if (!request) {
      this.logger.warn(`Request ${id} not found`);
      return;
    }

    request.status = status;
    if (txHash) {
      request.txHash = txHash;
    }
    if (error) {
      request.error = error;
    }

    this.requests.set(id, request);
    this.logger.log(`Updated request ${id} status to ${status}`);
  }

  getRequest(id: string): FaucetRequest | undefined {
    return this.requests.get(id);
  }

  getAllRequests(): FaucetRequest[] {
    return Array.from(this.requests.values());
  }

  getRequestsByUser(username: string): FaucetRequest[] {
    return Array.from(this.requests.values()).filter(
      (req) => req.username === username,
    );
  }

  getRequestsByAddress(userAddress: string): FaucetRequest[] {
    return Array.from(this.requests.values()).filter(
      (req) => req.userAddress === userAddress,
    );
  }

  getStats(): {
    totalRequests: number;
    completedRequests: number;
    failedRequests: number;
    pendingRequests: number;
    totalAmountSent: number;
  } {
    const requests = Array.from(this.requests.values());

    return {
      totalRequests: requests.length,
      completedRequests: requests.filter((r) => r.status === 'completed')
        .length,
      failedRequests: requests.filter((r) => r.status === 'failed').length,
      pendingRequests: requests.filter((r) => r.status === 'pending').length,
      totalAmountSent: requests
        .filter((r) => r.status === 'completed')
        .reduce((sum, r) => sum + r.amount, 0),
    };
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
