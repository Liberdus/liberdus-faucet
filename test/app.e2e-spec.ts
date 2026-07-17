import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { BlockchainService } from './../src/blockchain/blockchain.service';

describe('Faucet API (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BlockchainService)
      .useValue({
        verifyEthereumTx: jest.fn().mockReturnValue(true),
        isEligibleNode: jest.fn().mockResolvedValue(true),
        getAccount: jest.fn().mockResolvedValue({
          stakeLock: { value: '0' },
          data: { balance: { value: '0' } },
        }),
        transferFunds: jest
          .fn()
          .mockResolvedValue({ success: true, txHash: 'test-tx-hash' }),
        libToWei: jest.fn((amount: number) => BigInt(amount * 10 ** 18)),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/faucet/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/faucet/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body.status).toBe('ok');
        });
    });
  });

  describe('/faucet/stats (GET)', () => {
    it('should return faucet statistics', () => {
      return request(app.getHttpServer())
        .get('/faucet/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalRequests');
          expect(res.body).toHaveProperty('completedRequests');
          expect(res.body).toHaveProperty('failedRequests');
          expect(res.body).toHaveProperty('pendingRequests');
          expect(res.body).toHaveProperty('totalAmountSent');
        });
    });
  });

  describe('/faucet (POST)', () => {
    const validFaucetRequest = {
      nodeAddress: 'test-node-address',
      username: 'testuser',
      userAddress:
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      networkId: 'testnet',
      sign: {
        owner: 'test-owner',
        sig: 'test-signature',
      },
    };

    it('should process valid faucet request', () => {
      return request(app.getHttpServer())
        .post('/faucet')
        .send(validFaucetRequest)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('success');
          expect(res.body).toHaveProperty('requestId');
          expect(res.body).toHaveProperty('message');
        });
    });

    it('should reject request with missing fields', () => {
      const invalidRequest = {
        nodeAddress: 'test-node-address',
        username: 'testuser',
        // missing userAddress and sign
      };

      return request(app.getHttpServer())
        .post('/faucet')
        .send(invalidRequest)
        .expect(400);
    });

    it('should reject request with invalid signature structure', () => {
      const invalidRequest = {
        ...validFaucetRequest,
        sign: {
          owner: 'test-owner',
          // missing sig
        },
      };

      return request(app.getHttpServer())
        .post('/faucet')
        .send(invalidRequest)
        .expect(400);
    });

    it('should reject request with empty strings', () => {
      const invalidRequest = {
        nodeAddress: '',
        username: '',
        userAddress: '',
        sign: {
          owner: '',
          sig: '',
        },
      };

      return request(app.getHttpServer())
        .post('/faucet')
        .send(invalidRequest)
        .expect(400);
    });
  });
});
