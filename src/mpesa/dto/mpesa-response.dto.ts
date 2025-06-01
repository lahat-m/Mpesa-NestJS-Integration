/**
 * mpesa-response.dto.ts
 * @description This file defines the DTOs for handling M-Pesa responses and transaction statuses.
 */
import { ApiProperty } from '@nestjs/swagger';

export class MpesaResponseDto {
  @ApiProperty()
  MerchantRequestID: string;
  
  @ApiProperty()
  CheckoutRequestID: string;
  
  @ApiProperty()
  ResponseCode: string;
  
  @ApiProperty()
  ResponseDescription: string;
  
  @ApiProperty()
  CustomerMessage: string;
}

export class TransactionStatusDto {
  @ApiProperty()
  id: string;
  
  @ApiProperty()
  merchantRequestID: string;
  
  @ApiProperty()
  status: string;
  
  @ApiProperty()
  amount: number;
  
  @ApiProperty()
  phoneNumber: string;
  
  @ApiProperty()
  mpesaReceiptNumber?: string;
  
  @ApiProperty()
  createdAt: Date;
}