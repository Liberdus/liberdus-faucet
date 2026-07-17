import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  BlockchainService,
  NetworkConfig,
} from '../blockchain/blockchain.service';
import { StatsService } from '../stats/stats.service';
import { FaucetRequestDto } from '../common/dto/faucet-request.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FaucetService {
  private readonly logger = new Logger(FaucetService.name);
  private readonly processingUsers = new Set<string>();
  private readonly ipCooldowns = new Map<string, number>();
  private readonly IP_COOLDOWN_MS = parseInt(
    process.env.IP_COOLDOWN_MS || '86400000',
    10,
  );
  private readonly FAUCET_AMOUNT = parseFloat(
    process.env.FAUCET_AMOUNT || '10',
  ); // Default 10 tokens for node faucet
  private readonly USER_FAUCET_AMOUNT = parseFloat(
    process.env.USER_FAUCET_AMOUNT || '100',
  ); // Default 100 tokens for user faucet
  private readonly USER_MAX_BALANCE = parseFloat(
    process.env.USER_MAX_BALANCE || '100',
  ); // Default 100 tokens max balance for user faucet
  private readonly networks: Record<string, NetworkConfig>;

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly statsService: StatsService,
  ) {
    // Allow test and deployment environments to provide a different config file.
    const networksPath = path.resolve(
      process.cwd(),
      process.env.NETWORKS_CONFIG_PATH || 'networks.json',
    );
    const networksData = fs.readFileSync(networksPath, 'utf-8');
    const networksJson = JSON.parse(networksData);

    // Transform the networks.json structure to include networkId
    this.networks = Object.entries(networksJson).reduce(
      (acc, [networkId, config]: [string, any]) => {
        if (
          config == null ||
          typeof config !== 'object' ||
          Array.isArray(config)
        ) {
          throw new Error(`Invalid configuration for network '${networkId}'`);
        }

        for (const field of [
          'protocols',
          'host',
          'faucetAddress',
          'faucetPrivateKey',
          'archiverUrl',
          'monitorUrl',
        ] as const) {
          if (
            typeof config[field] !== 'string' ||
            config[field].trim() === ''
          ) {
            throw new Error(
              `Network '${networkId}' is missing required configuration: ${field}`,
            );
          }
        }

        const hasPrivateFaucetConfig =
          config.privateFaucetAddress !== undefined ||
          config.privateFaucetPrivateKey !== undefined;
        if (
          hasPrivateFaucetConfig &&
          (typeof config.privateFaucetAddress !== 'string' ||
            config.privateFaucetAddress.trim() === '' ||
            typeof config.privateFaucetPrivateKey !== 'string' ||
            config.privateFaucetPrivateKey.trim() === '')
        ) {
          throw new Error(
            `Network '${networkId}' must configure privateFaucetAddress and privateFaucetPrivateKey together`,
          );
        }

        acc[networkId] = {
          ...config,
          networkId,
        };
        return acc;
      },
      {} as Record<string, NetworkConfig>,
    );

    this.logger.log(
      `Loaded ${Object.keys(this.networks).length} network configurations`,
    );
  }

  private getNetworkConfig(networkId: string): NetworkConfig {
    const config = this.networks[networkId];
    if (!config) {
      throw new NotFoundException(`Network with ID '${networkId}' not found`);
    }
    return config;
  }

  async processFaucetRequest(
    faucetRequest: FaucetRequestDto,
    clientIp: string,
  ): Promise<{
    success: boolean;
    requestId: string;
    txHash?: string;
    message: string;
  }> {
    const normalizedAddress = faucetRequest.userAddress.toLowerCase();
    const normalizedIp = this.normalizeIp(clientIp);
    const isNodeFaucet = !!faucetRequest.nodeAddress;
    const faucetType = isNodeFaucet ? 'node' : 'user';
    const ipCooldownKey = this.getIpCooldownKey(normalizedIp, faucetType);
    this.cleanupExpiredIpCooldowns();
    this.assertIpCooldown(ipCooldownKey);

    const hasProcessing = this.processingUsers.has(normalizedAddress);

    this.logger.log(`hasProcessing for ${normalizedAddress}: ${hasProcessing}`);
    this.logger.log(
      `Current processing users before check: ${Array.from(this.processingUsers).join(', ')}`,
    );

    if (this.processingUsers.has(normalizedAddress)) {
      this.logger.warn(
        `Blocked concurrent request for address: ${normalizedAddress}`,
      );
      throw new BadRequestException(
        'A faucet request is already in progress for this address. Please wait.',
      );
    }
    this.processingUsers.add(normalizedAddress);
    this.logger.log(
      `User address ${normalizedAddress} added to processing set`,
    );
    this.logger.log(
      `Current processing users: ${Array.from(this.processingUsers).join(', ')}`,
    );

    try {
      const faucetAmount = isNodeFaucet
        ? this.FAUCET_AMOUNT
        : this.USER_FAUCET_AMOUNT;

      this.logger.log(
        `Processing ${faucetType} faucet request for user: ${faucetRequest.username} on network: ${faucetRequest.networkId}; nodeAddress: ${faucetRequest.nodeAddress ?? 'not provided (user faucet request)'}`,
      );

      // Validate network ID and get configuration
      const networkConfig = this.getNetworkConfig(faucetRequest.networkId);

      // Validate the request (basic validation - could be enhanced with signature verification)
      const validateResult = await this.validateRequest(
        faucetRequest,
        networkConfig,
        isNodeFaucet,
      );
      if (validateResult.success === false) {
        throw new BadRequestException(
          validateResult.reason || 'Invalid request',
        );
      }

      // Create stats entry
      const request = this.statsService.createRequest(
        faucetRequest.nodeAddress,
        faucetRequest.username,
        faucetRequest.userAddress,
        faucetAmount,
      );

      try {
        // Check if user account is private
        let isPrivate = false;
        try {
          const account = await this.blockchainService.getAccount(
            faucetRequest.userAddress,
            networkConfig,
          );
          if (account && account.private) {
            isPrivate = true;
            this.logger.log(
              `User ${faucetRequest.username} has a private account. Using private faucet.`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch account info for ${faucetRequest.userAddress}. Defaulting to public faucet. Error: ${error.message}`,
          );
        }

        // Process the blockchain transaction
        const result = await this.blockchainService.transferFunds(
          faucetRequest.userAddress,
          faucetAmount,
          networkConfig,
          undefined,
          isPrivate,
        );

        // Update stats with success
        this.statsService.updateRequestStatus(
          request.id,
          'completed',
          result.txHash || result.hash,
        );
        this.recordIpUsage(ipCooldownKey);

        this.logger.log(
          `Faucet request completed for ${faucetRequest.username}`,
        );

        return {
          success: true,
          requestId: request.id,
          txHash: result.txHash || result.hash,
          message: `Successfully sent ${faucetAmount} tokens to ${faucetRequest.userAddress}`,
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
    } finally {
      const cleanupTimer = setTimeout(() => {
        this.processingUsers.delete(normalizedAddress);
        this.logger.log(
          `User address ${normalizedAddress} removed from processing set after timeout`,
        );
        this.logger.log(
          `Current processing users: ${Array.from(this.processingUsers).join(', ')}`,
        );
      }, 10000); // Delay removal to ensure processing is fully complete
      cleanupTimer.unref();
    }
  }

  private async validateRequest(
    request: FaucetRequestDto,
    networkConfig: NetworkConfig,
    isNodeFaucet: boolean,
  ): Promise<{ success: boolean; reason?: string }> {
    // Basic validation
    if (
      !request.username ||
      !request.userAddress ||
      !request.networkId ||
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

    if (isNodeFaucet) {
      // Node faucet validation
      return this.validateNodeFaucetRequest(request, networkConfig);
    } else {
      // User faucet validation
      return this.validateUserFaucetRequest(request, networkConfig);
    }
  }

  private async validateNodeFaucetRequest(
    request: FaucetRequestDto,
    networkConfig: NetworkConfig,
  ): Promise<{ success: boolean; reason?: string }> {
    if (!request.nodeAddress) {
      return {
        success: false,
        reason: 'Node address is required for node faucet',
      };
    }

    const isEligibleNode = await this.blockchainService.isEligibleNode(
      request.nodeAddress,
      networkConfig,
    );
    if (!isEligibleNode) {
      this.logger.warn(
        `Node address ${request.nodeAddress} is not a valid standby or joining node`,
      );
      return {
        success: false,
        reason: 'Node address is not a valid standby or joining node',
      };
    }

    const nodeAccount = await this.blockchainService.getAccount(
      request.nodeAddress,
      networkConfig,
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
      networkConfig,
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
      `Validating node faucet request for user: ${request.username}, Eligible Node: ${isEligibleNode}, Nominee Account: ${JSON.stringify(nomineeAccount)}`,
    );

    return { success: true };
  }

  private async validateUserFaucetRequest(
    request: FaucetRequestDto,
    networkConfig: NetworkConfig,
  ): Promise<{ success: boolean; reason?: string }> {
    // Get user account
    const userAccount = await this.blockchainService.getAccount(
      request.userAddress,
      networkConfig,
    );

    if (!userAccount) {
      this.logger.warn(
        `User account not found for address: ${request.userAddress}`,
      );
      return { success: false, reason: 'User account not found' };
    }

    // Check user balance
    const balance = BigInt('0x' + userAccount.data.balance.value);
    const maxBalanceInWei = this.blockchainService.libToWei(
      this.USER_MAX_BALANCE,
    );

    if (balance >= maxBalanceInWei) {
      this.logger.warn(
        `User ${request.userAddress} has balance ${balance} which exceeds maximum ${maxBalanceInWei}`,
      );
      return {
        success: false,
        reason: `User balance exceeds maximum allowed balance of ${this.USER_MAX_BALANCE} LIB`,
      };
    }

    this.logger.log(
      `Validating user faucet request for user: ${request.username}, Balance: ${balance}, Max Balance: ${maxBalanceInWei}`,
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

  private normalizeIp(ipAddress: string): string {
    if (!ipAddress) {
      return 'unknown';
    }

    if (ipAddress.startsWith('::ffff:')) {
      return ipAddress.slice(7);
    }

    return ipAddress;
  }

  private getIpCooldownKey(
    ipAddress: string,
    faucetType: 'node' | 'user',
  ): string {
    if (ipAddress === 'unknown') {
      return 'unknown';
    }

    return `${ipAddress}:${faucetType}`;
  }

  private assertIpCooldown(ipCooldownKey: string): void {
    if (ipCooldownKey === 'unknown') {
      return;
    }

    const lastRequestAt = this.ipCooldowns.get(ipCooldownKey);
    if (!lastRequestAt) {
      return;
    }

    const elapsedMs = Date.now() - lastRequestAt;
    if (elapsedMs >= this.IP_COOLDOWN_MS) {
      this.ipCooldowns.delete(ipCooldownKey);
      return;
    }

    throw new BadRequestException(
      'Faucet should not be abused by using it repeatedly. Please try again later.',
    );
  }

  private recordIpUsage(ipCooldownKey: string): void {
    if (ipCooldownKey === 'unknown') {
      return;
    }

    this.ipCooldowns.set(ipCooldownKey, Date.now());
    this.logger.log(`Recorded faucet cooldown for ${ipCooldownKey}`);
  }

  private cleanupExpiredIpCooldowns(): void {
    const now = Date.now();

    for (const [ipAddress, lastRequestAt] of this.ipCooldowns.entries()) {
      if (now - lastRequestAt >= this.IP_COOLDOWN_MS) {
        this.ipCooldowns.delete(ipAddress);
      }
    }
  }
}
