import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { BlockchainService } from '../blockchain/blockchain.service';
import { StatsService } from '../stats/stats.service';
import { FaucetRequestDto } from '../common/dto/faucet-request.dto';

@Injectable()
export class FaucetService {
  private readonly logger = new Logger(FaucetService.name);
  private readonly FAUCET_AMOUNT = parseFloat(
    process.env.FAUCET_AMOUNT || '10',
  ); // Default 10 tokens

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly statsService: StatsService,
  ) {}

  async processFaucetRequest(faucetRequest: FaucetRequestDto): Promise<{
    success: boolean;
    requestId: string;
    txHash?: string;
    message: string;
  }> {
    this.logger.log(
      `Processing faucet request for user: ${faucetRequest.username}`,
    );

    // Validate the request (basic validation - could be enhanced with signature verification)
    const validateResult = await this.validateRequest(faucetRequest);
    if (validateResult.success === false) {
      throw new BadRequestException(validateResult.reason || 'Invalid request');
    }

    // Create stats entry
    const request = this.statsService.createRequest(
      faucetRequest.nodeAddress,
      faucetRequest.username,
      faucetRequest.userAddress,
      this.FAUCET_AMOUNT,
    );

    try {
      // Process the blockchain transaction
      const result = await this.blockchainService.transferFunds(
        faucetRequest.userAddress,
        this.FAUCET_AMOUNT,
      );

      // Update stats with success
      this.statsService.updateRequestStatus(
        request.id,
        'completed',
        result.txHash || result.hash,
      );

      this.logger.log(`Faucet request completed for ${faucetRequest.username}`);

      return {
        success: true,
        requestId: request.id,
        txHash: result.txHash || result.hash,
        message: `Successfully sent ${this.FAUCET_AMOUNT} tokens to ${faucetRequest.userAddress}`,
      };
    } catch (error) {
      this.logger.error(
        `Faucet request failed for ${faucetRequest.username}:`,
        error,
      );

      // Update stats with failure
      this.statsService.updateRequestStatus(
        request.id,
        'failed',
        undefined,
        error.message,
      );

      return {
        success: false,
        requestId: request.id,
        message: `Failed to process faucet request: ${error.message}`,
      };
    }
  }

  private async validateRequest(
    request: FaucetRequestDto,
  ): Promise<{ success: boolean; reason?: string }> {
    // Basic validation
    if (
      !request.nodeAddress ||
      !request.username ||
      !request.userAddress ||
      !request.sign
    ) {
      return { success: false, reason: 'Missing required fields' };
    }

    // Validate address format (basic check for 64-character hex or Ethereum address)
    if (!/^(0x)?[a-fA-F0-9]{40,64}$/.test(request.userAddress)) {
      this.logger.warn(`Invalid address format: ${request.userAddress}`);
      return { success: false, reason: 'Invalid user address format' };
    }

    // Validate signature
    const isValidSignature = this.blockchainService.verifyEthereumTx(request);
    if (!isValidSignature) {
      this.logger.warn(
        `Invalid signature for user: ${request.username}, address: ${request.userAddress}`,
      );
      return { success: false, reason: 'Invalid signature' };
    }

    const isStandbyNode = await this.blockchainService.isValidStandbyNode(
      request.nodeAddress,
    );
    if (!isStandbyNode) {
      this.logger.warn(
        `Node address ${request.nodeAddress} is not a valid standby node`,
      );
      return {
        success: false,
        reason: 'Node address is not a valid standby node',
      };
    }
    const nodeAccount = await this.blockchainService.getAccount(
      request.nodeAddress,
    );
    if (nodeAccount) {
      this.logger.log(
        `Node account for ${request.nodeAddress}: ${JSON.stringify(nodeAccount)}`,
      );
      const stakeLocked = BigInt('0x' + nodeAccount.stakeLock.value);
      if (stakeLocked >= this.blockchainService.libToWei(this.FAUCET_AMOUNT)) {
        this.logger.log(
          `Node ${request.nodeAddress} has sufficient stake: ${stakeLocked}`,
        );
        return { success: false, reason: 'Node already has sufficient stake' };
      }
    }
    const nomineeAccount = await this.blockchainService.getAccount(
      request.userAddress,
    );
    if (!nomineeAccount) {
      this.logger.warn(
        `Nominee account not found for address: ${request.userAddress}`,
      );
      return { success: false, reason: 'Nominee account not found' };
    }

    if (nomineeAccount) {
      const balance = BigInt('0x' + nomineeAccount.data.balance.value);
      if (balance >= this.blockchainService.libToWei(this.FAUCET_AMOUNT)) {
        this.logger.error(
          `Nominee account ${request.userAddress} already has sufficient balance: ${balance}`,
        );
        return {
          success: false,
          reason: 'Nominee account already has sufficient balance',
        };
      }
    }

    this.logger.log(
      `Validating request for user: ${request.username}, Standby Node: ${isStandbyNode}, Nominee Account: ${JSON.stringify(nomineeAccount)}`,
    );

    return { success: true };
  }

  // Additional method to get faucet stats
  getFaucetStats() {
    return this.statsService.getStats();
  }

  // Method to get request by ID
  getRequest(requestId: string) {
    return this.statsService.getRequest(requestId);
  }
}
