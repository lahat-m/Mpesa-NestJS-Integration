/**
 * @file MpesaService - Handles M-Pesa STK Push and Callback processing
 * @description This service manages M-Pesa STK Push requests, processes callbacks, and maintains transaction records.
 * It includes a circuit breaker mechanism to handle service outages gracefully.
 * It also provides methods to retrieve transaction statuses and all transactions with pagination.
 * It uses Prisma for database interactions and Axios for HTTP requests to the M-Pesa API.
 */
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosResponse } from 'axios';
import { StkPushDto } from './dto/stk-push.dto';
import { MpesaCallbackDto } from './dto/mpesa-callback.dto';
import { MpesaResponseDto } from './dto/mpesa-response.dto';
import { MpesaConfig } from '../config/mpesa.config';
import { MpesaUtils } from './utils/mpesa.utils';
import { TransactionStatus } from '@prisma/client';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failures: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);
  private readonly circuitBreaker: CircuitBreakerStatus = {
    state: CircuitBreakerState.CLOSED,
    failures: 0,
  };

  private readonly maxFailures = 5;
  private readonly timeout = 30000;
  private readonly resetTimeout = 60000;

  constructor(
    private readonly configService: ConfigService,
    private readonly mpesaConfig: MpesaConfig,
    private readonly prisma: PrismaService,
  ) { }

  private async getAccessToken(): Promise<string> {
    try {
      const auth = Buffer.from(
        `${this.mpesaConfig.consumerKey}:${this.mpesaConfig.consumerSecret}`
      ).toString('base64');

      const response: AxiosResponse = await axios.get(
        this.mpesaConfig.authUrl,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
          timeout: this.timeout,
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token received from M-Pesa API');
      }

      return response.data.access_token;
    } catch (error) {
      this.logger.error('Failed to get M-Pesa access token', error);
      this.recordFailure();
      throw new HttpException(
        'Failed to authenticate with M-Pesa API',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async initiateStkPush(stkPushData: StkPushDto): Promise<MpesaResponseDto> {
    try {
      if (this.circuitBreaker.state === CircuitBreakerState.OPEN) {
        if (this.circuitBreaker.nextAttemptTime && Date.now() < this.circuitBreaker.nextAttemptTime.getTime()) {
          throw new HttpException(
            'M-Pesa service temporarily unavailable',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        } else {
          this.circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
        }
      }

      const accessToken = await this.getAccessToken();
      const timestamp = MpesaUtils.getTimestamp();
      const password = MpesaUtils.generatePassword(
        this.mpesaConfig.businessShortCode,
        this.mpesaConfig.passkey,
        timestamp
      );
      const formattedPhone = MpesaUtils.formatPhoneNumber(stkPushData.phoneNumber);

      const requestPayload = {
        BusinessShortCode: this.mpesaConfig.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: stkPushData.amount,
        PartyA: formattedPhone,
        PartyB: this.mpesaConfig.businessShortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${this.mpesaConfig.callbackUrl}`,
        AccountReference: stkPushData.accountReference || 'Payment',
        TransactionDesc: stkPushData.transactionDesc || 'Payment for services',
      };

      this.logger.log(`STK Push payload: ${JSON.stringify({ ...requestPayload, Password: '[REDACTED]' })}`);

      const response: AxiosResponse = await axios.post(
        this.mpesaConfig.stkPushUrl,
        requestPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      if (response.data.ResponseCode === '0') {
        this.recordSuccess();

        await this.saveTransaction({
          merchantRequestID: response.data.MerchantRequestID,
          checkoutRequestID: response.data.CheckoutRequestID,
          responseCode: response.data.ResponseCode,
          responseDescription: response.data.ResponseDescription,
          customerMessage: response.data.CustomerMessage,
          amount: stkPushData.amount,
          phoneNumber: formattedPhone,
          accountReference: stkPushData.accountReference || 'Payment',
          transactionDesc: stkPushData.transactionDesc || 'Payment for services',
          status: TransactionStatus.PENDING,
        });

        return {
          MerchantRequestID: response.data.MerchantRequestID,
          CheckoutRequestID: response.data.CheckoutRequestID,
          ResponseCode: response.data.ResponseCode,
          ResponseDescription: response.data.ResponseDescription,
          CustomerMessage: response.data.CustomerMessage,
        };
      } else {
        this.logger.error(`STK Push failed with response: ${JSON.stringify(response.data)}`);
        throw new HttpException(
          response.data.ResponseDescription || 'STK Push failed',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      this.logger.error('STK Push initiation failed', error);
      this.recordFailure();

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to initiate STK Push',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async saveTransaction(transactionData: any): Promise<void> {
    try {
      await this.prisma.mpesaTransaction.create({
        data: transactionData,
      });
      this.logger.log(`Transaction saved: ${transactionData.checkoutRequestID}`);
    } catch (error) {
      this.logger.error('Failed to save transaction', error);
      // Don't throw here to avoid breaking the flow
    }
  }

  // FINAL: Enhanced handleCallback method for your MpesaService
  // Replace your current handleCallback method with this:

  async handleCallback(callbackData: MpesaCallbackDto): Promise<void> {
    try {
      this.logger.log(`=== M-PESA CALLBACK PROCESSING START ===`);
      this.logger.log(`Full callback data received:`);
      this.logger.log(JSON.stringify(callbackData, null, 2));

      const { Body } = callbackData;

      if (!Body) {
        this.logger.error('Invalid callback format: missing Body');
        throw new HttpException('Invalid callback format: missing Body', HttpStatus.BAD_REQUEST);
      }

      const { stkCallback } = Body;

      if (!stkCallback) {
        this.logger.error('Invalid callback format: missing stkCallback');
        throw new HttpException('Invalid callback format: missing stkCallback', HttpStatus.BAD_REQUEST);
      }

      // Extract callback details
      const {
        MerchantRequestID,
        CheckoutRequestID,
        ResultCode,
        ResultDesc,
        CallbackMetadata,
      } = stkCallback;

      this.logger.log(`=== CALLBACK DETAILS ===`);
      this.logger.log(`MerchantRequestID: ${MerchantRequestID}`);
      this.logger.log(`CheckoutRequestID: ${CheckoutRequestID}`);
      this.logger.log(`ResultCode: ${ResultCode} (type: ${typeof ResultCode})`);
      this.logger.log(`ResultDesc: ${ResultDesc}`);
      this.logger.log(`CallbackMetadata: ${JSON.stringify(CallbackMetadata, null, 2)}`);

      // First, check if transaction exists
      this.logger.log(`=== CHECKING EXISTING TRANSACTION ===`);
      let existingTransaction;
      try {
        existingTransaction = await this.prisma.mpesaTransaction.findUnique({
          where: { checkoutRequestID: CheckoutRequestID },
        });

        if (!existingTransaction) {
          this.logger.error(`Transaction not found for CheckoutRequestID: ${CheckoutRequestID}`);
          throw new HttpException(
            `Transaction not found for CheckoutRequestID: ${CheckoutRequestID}`,
            HttpStatus.NOT_FOUND,
          );
        }

        this.logger.log(`Found existing transaction: ${existingTransaction.id}`);
        this.logger.log(`Current status: ${existingTransaction.status}`);

      } catch (error) {
        this.logger.error(`Database error while finding transaction:`, error);
        throw error;
      }

      // Prepare update data - always update these fields
      const updateData: any = {
        resultCode: Number(ResultCode),
        resultDesc: ResultDesc || null,
        updatedAt: new Date(),
      };

      this.logger.log(`=== PROCESSING RESULT CODE: ${ResultCode} ===`);

      if (Number(ResultCode) === 0) {
        // SUCCESS CASE
        this.logger.log(`Processing SUCCESSFUL payment...`);
        updateData.status = TransactionStatus.SUCCESS;

        if (CallbackMetadata && CallbackMetadata.Item && Array.isArray(CallbackMetadata.Item)) {
          this.logger.log(`Processing metadata with ${CallbackMetadata.Item.length} items...`);

          // Option 1: Use the enhanced MpesaUtils
          this.logger.log(`=== USING MPESA UTILS TO PARSE METADATA ===`);
          const metadata = MpesaUtils.parseCallbackMetadata(CallbackMetadata.Item);

          if (metadata.MpesaReceiptNumber) {
            updateData.mpesaReceiptNumber = metadata.MpesaReceiptNumber;
            this.logger.log(`Set mpesaReceiptNumber: ${updateData.mpesaReceiptNumber}`);
          } else {
            this.logger.warn(`No MpesaReceiptNumber found in metadata`);
          }

          if (metadata.TransactionDate) {
            updateData.transactionDate = metadata.TransactionDate;
            this.logger.log(`Set transactionDate: ${updateData.transactionDate.toISOString()}`);
          } else {
            this.logger.warn(`No TransactionDate found in metadata, using current time`);
            updateData.transactionDate = new Date();
          }

          // Log all extracted metadata
          this.logger.log(`Extracted metadata summary:`);
          this.logger.log(`- Amount: ${metadata.Amount}`);
          this.logger.log(`- MpesaReceiptNumber: ${metadata.MpesaReceiptNumber}`);
          this.logger.log(`- TransactionDate: ${metadata.TransactionDate?.toISOString()}`);
          this.logger.log(`- PhoneNumber: ${metadata.PhoneNumber}`);

        } else {
          this.logger.warn(`No CallbackMetadata.Item found for successful payment`);
          this.logger.warn(`CallbackMetadata structure: ${JSON.stringify(CallbackMetadata)}`);

          // Set fallback values for successful payment without metadata
          updateData.transactionDate = new Date();
          updateData.mpesaReceiptNumber = `FALLBACK_${Date.now()}`;
        }

      } else {
        // FAILED/CANCELLED CASES
        this.logger.log(`Processing FAILED/CANCELLED payment with code: ${ResultCode}`);

        if (Number(ResultCode) === 1032) {
          updateData.status = TransactionStatus.CANCELLED;
          this.logger.log(`🚫 Payment CANCELLED by user`);
        } else if (Number(ResultCode) === 1037) {
          updateData.status = TransactionStatus.TIMEOUT;
          this.logger.log(`⏰ Payment TIMEOUT`);
        } else {
          updateData.status = TransactionStatus.FAILED;
          this.logger.log(`💥 Payment FAILED with code: ${ResultCode}`);
        }

        this.logger.log(`Failure reason: ${ResultDesc}`);
      }

      // Log the final update data before database operation
      this.logger.log(`=== FINAL UPDATE DATA ===`);
      this.logger.log(JSON.stringify({
        ...updateData,
        transactionDate: updateData.transactionDate?.toISOString(),
      }, null, 2));

      // Perform database update
      this.logger.log(`=== UPDATING DATABASE ===`);
      try {
        const updatedTransaction = await this.prisma.mpesaTransaction.update({
          where: { checkoutRequestID: CheckoutRequestID },
          data: updateData,
        });

        this.logger.log(`=== DATABASE UPDATE SUCCESSFUL ===`);
        this.logger.log(`Updated transaction summary:`);
        this.logger.log(`- ID: ${updatedTransaction.id}`);
        this.logger.log(`- CheckoutRequestID: ${updatedTransaction.checkoutRequestID}`);
        this.logger.log(`- Status: ${updatedTransaction.status}`);
        this.logger.log(`- ResultCode: ${updatedTransaction.resultCode}`);
        this.logger.log(`- ResultDesc: ${updatedTransaction.resultDesc}`);
        this.logger.log(`- MpesaReceiptNumber: ${updatedTransaction.mpesaReceiptNumber}`);
        this.logger.log(`- TransactionDate: ${updatedTransaction.transactionDate?.toISOString()}`);
        this.logger.log(`- UpdatedAt: ${updatedTransaction.updatedAt?.toISOString()}`);

        this.logger.log(`=== M-PESA CALLBACK PROCESSING COMPLETE ===`);

      } catch (dbError) {
        this.logger.error(`=== DATABASE UPDATE FAILED ===`);
        this.logger.error(`Database error details:`, dbError);

        if (dbError.code === 'P2025') {
          this.logger.error(`Transaction with CheckoutRequestID ${CheckoutRequestID} not found in database`);
          throw new HttpException(
            `Transaction not found: ${CheckoutRequestID}`,
            HttpStatus.NOT_FOUND,
          );
        } else {
          this.logger.error(`Unexpected database error: ${dbError.message}`);
          throw new HttpException(
            'Database update failed',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

    } catch (error) {
      this.logger.error(`=== CALLBACK PROCESSING FAILED ===`);
      this.logger.error(`Error details:`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Callback processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  // NEW: Get individual transaction status
  async getTransactionStatus(checkoutRequestId: string): Promise<any> {
    try {
      const transaction = await this.prisma.mpesaTransaction.findUnique({
        where: { checkoutRequestID: checkoutRequestId },
      });

      if (!transaction) {
        throw new HttpException(
          `Transaction with CheckoutRequestID ${checkoutRequestId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        id: transaction.id,
        checkoutRequestID: transaction.checkoutRequestID,
        merchantRequestID: transaction.merchantRequestID,
        amount: transaction.amount,
        phoneNumber: transaction.phoneNumber,
        accountReference: transaction.accountReference,
        transactionDesc: transaction.transactionDesc,
        status: transaction.status,
        mpesaReceiptNumber: transaction.mpesaReceiptNumber,
        transactionDate: transaction.transactionDate,
        resultCode: transaction.resultCode,
        resultDesc: transaction.resultDesc,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get transaction status: ${checkoutRequestId}`, error);
      throw error;
    }
  }

  async getAllTransactions(
    offset: number = 0,
    limit: number = 50,
    cursor?: string,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<any> {
    try {
      this.logger.log(`Fetching transactions: offset=${offset}, limit=${limit}, sortBy=${sortBy}, sortOrder=${sortOrder}`);

      const [transactions, total] = await Promise.all([
        this.prisma.mpesaTransaction.findMany({
          skip: offset,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder,
          },
        }),
        this.prisma.mpesaTransaction.count(),
      ]);

      return {
        data: transactions,
        pagination: {
          total,
          offset,
          limit,
          hasMore: offset + limit < total,
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch transactions', error);
      throw new HttpException(
        'Failed to retrieve transactions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getCircuitBreakerStatus(): Promise<CircuitBreakerStatus> {
    return { ...this.circuitBreaker };
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreaker.state = CircuitBreakerState.CLOSED;
      this.circuitBreaker.failures = 0;
      this.logger.log('Circuit breaker reset to CLOSED state');
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = new Date();

    if (this.circuitBreaker.failures >= this.maxFailures) {
      this.circuitBreaker.state = CircuitBreakerState.OPEN;
      this.circuitBreaker.nextAttemptTime = new Date(Date.now() + this.resetTimeout);
      this.logger.warn('Circuit breaker switched to OPEN state');
    }
  }
}