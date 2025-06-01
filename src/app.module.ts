import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MpesaModule } from './mpesa/mpesa.module';
import { MpesaService } from './mpesa/mpesa.service';
import { MpesaConfig } from './config/mpesa.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MpesaModule,
  ],
  // controllers: [MpesaModule],
  // providers: [MpesaService, MpesaConfig],
})
export class AppModule {}