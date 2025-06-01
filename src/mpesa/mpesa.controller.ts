/**
 * M-Pesa Controller
 * Handles M-Pesa STK Push, callback processing, transaction status retrieval, and health checks.
 * Implements throttling, IP whitelisting, and circuit breaker patterns.
 * Provides Swagger documentation for API endpoints.
 */
import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Query, 
  Param,
  Logger, 
  UseGuards, 
  Req, 
  HttpException, 
  HttpStatus,
  Injectable,
  CanActivate,
  ExecutionContext
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { MpesaService } from './mpesa.service';
import { StkPushDto } from './dto/stk-push.dto';
import { MpesaCallbackDto } from './dto/mpesa-callback.dto';
import { MpesaResponseDto } from './dto/mpesa-response.dto';
import { MpesaConfig } from '../config/mpesa.config';

// IP Whitelist Guard (unchanged)
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IpWhitelistGuard.name);

  constructor(private readonly mpesaConfig: MpesaConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);
    const allowedIps = this.mpesaConfig.allowedCallbackIps;
    
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('Development mode: skipping IP whitelist check');
      return true;
    }
    
    const isAllowed = allowedIps.includes(clientIp);
    
    if (!isAllowed) {
      this.logger.warn(`Unauthorized IP access attempt: ${clientIp}`);
    }
    
    return isAllowed;
  }

  private getClientIp(request: Request): string {
    const ip = (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      ''
    ).split(',')[0].trim();
    
    return ip;
  }
}

@ApiTags('M-Pesa')
@Controller('mpesa')
@UseGuards(ThrottlerGuard)
export class MpesaController {
  private readonly logger = new Logger(MpesaController.name);

  constructor(
    private readonly mpesaService: MpesaService,
    private readonly mpesaConfig: MpesaConfig,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint with circuit breaker status' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async healthCheck() {
    try {
      const circuitBreakerStatus = await this.mpesaService.getCircuitBreakerStatus();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'M-Pesa Integration',
        circuitBreaker: {
          state: circuitBreakerStatus.state,
          failures: circuitBreakerStatus.failures,
        },
        version: process.env.npm_package_version || '1.0.0',
      };
    } catch (error) {
      this.logger.error('Health check failed', error);
      throw new HttpException(
        {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          service: 'M-Pesa Integration',
          error: 'Service unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('stk-push')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Initiate STK Push payment' })
  @ApiResponse({ status: 201, description: 'STK Push initiated successfully', type: MpesaResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async initiateStkPush(@Body() stkPushData: StkPushDto): Promise<MpesaResponseDto> {
    try {
      this.logger.log(`Initiating STK Push for phone: ${stkPushData.phoneNumber}`);
      const result = await this.mpesaService.initiateStkPush(stkPushData);
      this.logger.log(`STK Push initiated successfully with checkout request ID: ${result.CheckoutRequestID}`);
      return result;
    } catch (error) {
      this.logger.error('STK Push failed', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          message: 'Failed to initiate STK Push',
          error: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('callback')
  @UseGuards(IpWhitelistGuard)
  @ApiOperation({ summary: 'Handle M-Pesa callback (IP restricted)' })
  @ApiResponse({ status: 200, description: 'Callback processed successfully' })
  @ApiResponse({ status: 403, description: 'IP not whitelisted' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async handleCallback(@Body() callbackData: MpesaCallbackDto, @Req() request: Request) {
    try {
      const clientIp = this.getClientIp(request);
      this.logger.log(`Processing M-Pesa callback from IP: ${clientIp}`);
      
      await this.mpesaService.handleCallback(callbackData);
      
      this.logger.log('M-Pesa callback processed successfully');
      return { 
        message: 'Callback processed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Callback processing failed', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          message: 'Failed to process callback',
          error: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // NEW: Get individual transaction status
  @Get('transaction/:checkoutRequestId')
  @ApiOperation({ summary: 'Get transaction status by checkout request ID' })
  @ApiParam({ 
    name: 'checkoutRequestId', 
    description: 'Checkout Request ID from STK Push response',
    example: 'ws_CO_01062025075045355743280570'
  })
  @ApiResponse({ status: 200, description: 'Transaction found' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getTransactionStatus(@Param('checkoutRequestId') checkoutRequestId: string) {
    try {
      this.logger.log(`Getting transaction status for: ${checkoutRequestId}`);
      return await this.mpesaService.getTransactionStatus(checkoutRequestId);
    } catch (error) {
      this.logger.error(`Failed to get transaction status: ${checkoutRequestId}`, error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          message: 'Failed to get transaction status',
          error: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all transactions with optional pagination' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of records to skip', example: 0 })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records to return', example: 50 })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for cursor-based pagination' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field', example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order', example: 'desc' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getAllTransactions(
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: string = 'desc',
  ) {
    try {
      const offsetNum = offset ? Math.max(0, parseInt(offset, 10)) : 0;
      const limitNum = limit ? Math.max(1, Math.min(1000, parseInt(limit, 10))) : 50;
      
      const validSortFields = ['createdAt', 'updatedAt', 'amount', 'phoneNumber', 'status'];
      const validSortOrders = ['asc', 'desc'];
      
      if (!validSortFields.includes(sortBy)) {
        throw new HttpException(
          `Invalid sortBy field. Allowed values: ${validSortFields.join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      
      if (!validSortOrders.includes(sortOrder)) {
        throw new HttpException(
          `Invalid sortOrder. Allowed values: ${validSortOrders.join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      
      this.logger.log(`Getting transactions - offset: ${offsetNum}, limit: ${limitNum}, sortBy: ${sortBy}, sortOrder: ${sortOrder}`);
      
      return await this.mpesaService.getAllTransactions(
        offsetNum, 
        limitNum, 
        cursor,
        sortBy,
        sortOrder as 'asc' | 'desc'
      );
    } catch (error) {
      this.logger.error('Failed to get transactions', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          message: 'Failed to retrieve transactions',
          error: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private getClientIp(request: Request): string {
    return (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      ''
    ).split(',')[0].trim();
  }
}