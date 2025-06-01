/**
 * @file mpesa.types.ts
 * @description This file defines the types and interfaces used in the M-Pesa integration module.
 * It includes classes for circuit breaker state, access token response, STK push request, and callback metadata.
 */
export class CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class AccessTokenResponse {
  access_token: string;
  expires_in: string;
}

export class StkPushRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export class CallbackMetadata {
  Amount?: number;
  MpesaReceiptNumber?: string;
  Balance?: number;
  TransactionDate?: Date;
  PhoneNumber?: string;
  [key: string]: any; // For additional metadata fields
}