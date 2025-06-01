/**
 * @file MpesaModule
 * @description This module handles the integration with the M-Pesa API, providing services for STK push and transaction management.
 * It includes configuration, throttling, and HTTP request handling.
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MpesaController } from './mpesa.controller';
import { MpesaService } from './mpesa.service';
import { PrismaService } from '../prisma/prisma.service';
import { MpesaConfig } from '../config/mpesa.config';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 seconds timeout
      maxRedirects: 3,
    }),
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 20, // 20 requests per minute
      },
      {
        name: 'stk-push',
        ttl: 60000, // 1 minute
        limit: 10, // 10 STK push requests per minute
      },
    ]),
  ],
  controllers: [MpesaController],
  providers: [MpesaService, PrismaService, MpesaConfig],
  exports: [MpesaService],
})
export class MpesaModule {}