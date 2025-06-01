/**
 * M-Pesa Configuration Service
 * This service validates and provides access to M-Pesa configuration settings.
 * It ensures that all required environment variables are set and correctly formatted.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MpesaConfig {
  private readonly logger = new Logger(MpesaConfig.name);

  constructor(private configService: ConfigService) {
    this.validateConfig();
  }

  private validateConfig(): void {
    const requiredVars = [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET', 
      'MPESA_BUSINESS_SHORT_CODE',
      'MPESA_PASSKEY',
      'MPESA_CALLBACK_URL'
    ];

    const missingVars = requiredVars.filter(varName => !this.configService.get(varName));
    
    if (missingVars.length > 0) {
      const error = `Missing required M-Pesa configuration: ${missingVars.join(', ')}`;
      this.logger.error(error);
      throw new Error(error);
    }

    // Validate callback URL format
    const callbackUrl = this.configService.get<string>('MPESA_CALLBACK_URL');
    if (callbackUrl && !callbackUrl.startsWith('http')) {
      throw new Error('MPESA_CALLBACK_URL must be a valid HTTP/HTTPS URL');
    }
  }

  get consumerKey(): string {
    return this.configService.get<string>('MPESA_CONSUMER_KEY')!;
  }

  get consumerSecret(): string {
    return this.configService.get<string>('MPESA_CONSUMER_SECRET')!;
  }

  get businessShortCode(): string {
    return this.configService.get<string>('MPESA_BUSINESS_SHORT_CODE')!;
  }

  get passkey(): string {
    return this.configService.get<string>('MPESA_PASSKEY')!;
  }

  get environment(): 'sandbox' | 'production' {
    return this.configService.get<'sandbox' | 'production'>('MPESA_ENVIRONMENT') || 'sandbox';
  }

  get callbackUrl(): string {
    return this.configService.get<string>('MPESA_CALLBACK_URL')!;
  }

  get baseUrl(): string {
    return this.environment === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
  }

  get authUrl(): string {
    return `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
  }

  get stkPushUrl(): string {
    return `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
  }

  get allowedCallbackIps(): string[] {
    // M-Pesa callback IP addresses (update with actual IPs from Safaricom)
    return [
        // allowed SAF  IPS
      // Add localhost for development
      '127.0.0.1',
      '::1'
    ];
  }
}