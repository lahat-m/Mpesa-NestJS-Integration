/**
 *  mpesa-callback.dto.ts
 *  @description This file defines the DTOs for handling M-Pesa callback responses.

 */
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional, ValidateNested, IsArray, Allow } from 'class-validator';
import { Type } from 'class-transformer';

class CallbackItem {
  @IsString()
  Name: string;

@Allow()
  Value: string | number;
}

class CallbackMetadata {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CallbackItem)
  @IsOptional()
  Item?: CallbackItem[];
}

class StkCallback {
  @ApiProperty()
  @IsString()
  MerchantRequestID: string;

  @ApiProperty()
  @IsString()
  CheckoutRequestID: string;

  @ApiProperty()
  @IsNumber()
  ResultCode: number;

  @ApiProperty()
  @IsString()
  ResultDesc: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CallbackMetadata)
  CallbackMetadata?: CallbackMetadata;
}

class CallbackBody {
  @ValidateNested()
  @Type(() => StkCallback)
  stkCallback: StkCallback;
}

export class MpesaCallbackDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => CallbackBody)
  Body: CallbackBody;
}

export class ErrorResponseDto {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  message: string;

  @ApiProperty()
  error: string;

  @ApiProperty()
  timestamp: string;
}