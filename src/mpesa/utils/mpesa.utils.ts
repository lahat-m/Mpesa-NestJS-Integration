/**
 * @file MpesaUtils
 * @description Utility class for M-Pesa operations, providing methods for timestamp generation, password creation,
 * phone number formatting, callback metadata parsing, and retry logic.
 */
import { Logger, NotFoundException } from '@nestjs/common';

export class MpesaUtils {
  private static readonly logger = new Logger(MpesaUtils.name);

  static getTimestamp(): string {
    const date = new Date();
    return date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2) +
      ('0' + date.getHours()).slice(-2) +
      ('0' + date.getMinutes()).slice(-2) +
      ('0' + date.getSeconds()).slice(-2);
  }

  static generatePassword(businessShortCode: string, passkey: string, timestamp: string): string {
    const concatenated = businessShortCode + passkey + timestamp;
    return Buffer.from(concatenated).toString('base64');
  }

  static formatPhoneNumber(phoneNumber: string): string {
    try {
      const cleaned = phoneNumber.replace(/\D/g, '');
      
      if (cleaned.startsWith('0') && cleaned.length === 10) {
        return '254' + cleaned.substring(1);
      } else if (cleaned.startsWith('254') && cleaned.length === 12) {
        return cleaned;
      } else if (cleaned.startsWith('+254')) {
        return cleaned.substring(1);
      } else if (cleaned.length === 9) {
        return '254' + cleaned;
      }
      
      throw new Error(`Invalid phone number format: ${phoneNumber}`);
      
    } catch (error) {
      MpesaUtils.logger.error(`Phone number formatting failed: ${phoneNumber}`, error?.message);
      throw error;
    }
  }

  // ENHANCED: Completely rewritten parseCallbackMetadata with detailed logging
  static parseCallbackMetadata(items: Array<{ Name: string; Value: string | number }>): any {
    const metadata: any = {};
    
    this.logger.log(`=== PARSING CALLBACK METADATA ===`);
    this.logger.log(`Received items: ${JSON.stringify(items, null, 2)}`);
    
    if (!items || !Array.isArray(items)) {
      this.logger.warn('No callback metadata items provided or items is not an array');
      return metadata;
    }
    
    this.logger.log(`Processing ${items.length} metadata items...`);
    
    items.forEach((item, index) => {
      try {
        this.logger.log(`Processing item ${index}: ${JSON.stringify(item)}`);
        
        if (!item || typeof item !== 'object' || !item.Name) {
          this.logger.warn(`Invalid metadata item at index ${index}: ${JSON.stringify(item)}`);
          return;
        }

        const name = String(item.Name).trim();
        const value = item.Value;
        
        this.logger.log(`Processing: ${name} = ${value} (type: ${typeof value})`);
        
        switch (name) {
          case 'Amount':
            metadata.Amount = Number(value);
            this.logger.log(`✅ Parsed Amount: ${metadata.Amount}`);
            break;
            
          case 'MpesaReceiptNumber':
            metadata.MpesaReceiptNumber = String(value).trim();
            this.logger.log(`✅ Parsed MpesaReceiptNumber: ${metadata.MpesaReceiptNumber}`);
            break;
            
          case 'Balance':
            metadata.Balance = Number(value);
            this.logger.log(`✅ Parsed Balance: ${metadata.Balance}`);
            break;
            
          case 'TransactionDate':
            const dateStr = String(value).trim();
            this.logger.log(`Parsing transaction date from: ${dateStr}`);
            metadata.TransactionDate = this.parseTransactionDate(dateStr);
            this.logger.log(`✅ Parsed TransactionDate: ${metadata.TransactionDate?.toISOString()}`);
            break;
            
          case 'PhoneNumber':
            metadata.PhoneNumber = String(value).trim();
            this.logger.log(`✅ Parsed PhoneNumber: ${metadata.PhoneNumber}`);
            break;
            
          default:
            // Store any other metadata fields as-is
            metadata[name] = value;
            this.logger.log(`✅ Parsed other field ${name}: ${value}`);
        }
      } catch (error) {
        this.logger.error(`❌ Error parsing callback metadata item ${index}: ${JSON.stringify(item)}`, error);
      }
    });
    
    this.logger.log(`=== FINAL PARSED METADATA ===`);
    this.logger.log(JSON.stringify(metadata, null, 2));
    
    return metadata;
  }

  // ENHANCED: Improved parseTransactionDate with better logging and timezone handling
  static parseTransactionDate(dateStr: string): Date {
    try {
      this.logger.log(`=== PARSING TRANSACTION DATE ===`);
      this.logger.log(`Input date string: "${dateStr}" (length: ${dateStr?.length})`);
      
      if (!dateStr || typeof dateStr !== 'string') {
        throw new Error(`Invalid date string provided: ${dateStr}`);
      }
      
      const cleanDateStr = dateStr.toString().trim();
      this.logger.log(`Cleaned date string: "${cleanDateStr}"`);
      
      if (cleanDateStr.length === 14) {
        // M-Pesa format: YYYYMMDDHHMMSS (e.g., "20250601075045")
        const year = cleanDateStr.slice(0, 4);
        const month = cleanDateStr.slice(4, 6);
        const day = cleanDateStr.slice(6, 8);
        const hour = cleanDateStr.slice(8, 10);
        const minute = cleanDateStr.slice(10, 12);
        const second = cleanDateStr.slice(12, 14);
        
        this.logger.log(`Date components: ${year}-${month}-${day} ${hour}:${minute}:${second}`);
        
        // Validate components
        const yearNum = parseInt(year);
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const hourNum = parseInt(hour);
        const minuteNum = parseInt(minute);
        const secondNum = parseInt(second);
        
        this.logger.log(`Parsed components: ${yearNum}-${monthNum}-${dayNum} ${hourNum}:${minuteNum}:${secondNum}`);
        
        if (yearNum < 2020 || yearNum > 2030 || 
            monthNum < 1 || monthNum > 12 ||
            dayNum < 1 || dayNum > 31 ||
            hourNum < 0 || hourNum > 23 ||
            minuteNum < 0 || minuteNum > 59 ||
            secondNum < 0 || secondNum > 59) {
          throw new Error(`Invalid date components: ${year}-${month}-${day} ${hour}:${minute}:${second}`);
        }
        
        // Create ISO string for proper parsing (assuming EAT timezone +03:00)
        const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`;
        this.logger.log(`ISO string: ${isoString}`);
        
        const parsedDate = new Date(isoString);
        
        // Validate the parsed date
        if (isNaN(parsedDate.getTime())) {
          throw new Error(`Failed to create valid date from: ${isoString}`);
        }
        
        this.logger.log(`✅ Successfully parsed M-Pesa date: ${cleanDateStr} → ${parsedDate.toISOString()}`);
        return parsedDate;
        
      } else if (cleanDateStr.length === 10) {
        // Unix timestamp (fallback)
        const timestamp = Number(cleanDateStr);
        if (isNaN(timestamp)) {
          throw new Error(`Invalid timestamp: ${cleanDateStr}`);
        }
        const date = new Date(timestamp * 1000);
        this.logger.log(`✅ Parsed Unix timestamp: ${cleanDateStr} → ${date.toISOString()}`);
        return date;
        
      } else {
        throw new Error(`Unexpected date format: "${cleanDateStr}" (length: ${cleanDateStr.length})`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to parse TransactionDate: "${dateStr}"`, error);
      // Return current time as fallback
      const fallbackDate = new Date();
      this.logger.warn(`⚠️ Using fallback date: ${fallbackDate.toISOString()}`);
      return fallbackDate;
    }
  }

  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        MpesaUtils.logger.warn(`Operation failed on attempt ${attempt}/${maxRetries}: ${error?.message}`);
        
        if (attempt < maxRetries) {
          const jitter = 0.5 + Math.random() * 0.5;
          const delay = baseDelay * Math.pow(2, attempt - 1) * jitter;
          await MpesaUtils.sleep(delay);
        }
      }
    }
    
    throw new NotFoundException('Operation failed after maximum retries');
  }
}