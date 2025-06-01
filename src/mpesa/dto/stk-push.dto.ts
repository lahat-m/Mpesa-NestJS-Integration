/**
 * stk-push.dto.ts
 * @description This file defines the Data Transfer Object (DTO) for initiating an M-Pesa STK push request.
 */
import { IsString, IsNumber, IsOptional, Min, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class StkPushDto {
  @ApiProperty({
    description: 'Amount to be paid',
    example: 100,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiProperty({
    description: 'Phone number in any Kenyan format (0712345678, 254712345678, +254712345678)',
    example: '+254712345678',
  })
  @IsString()
  @Matches(/^(\+?254|0)?[17][0-9]{8}$/, {
    message: 'Phone number must be a valid Kenyan mobile number',
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Account reference for the payment',
    example: 'ORDER123',
  })
  @IsString()
  accountReference: string;

  @ApiProperty({
    description: 'Description of the transaction',
    example: 'Payment for Order 123',
    required: false,
  })
  @IsString()
  @IsOptional()
  transactionDesc?: string = 'Payment';
}