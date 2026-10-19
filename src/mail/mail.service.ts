import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface OrderMailItem {
  productName: string;
  sku: string;
  combinationKey: string;
  quantity: number;
  unitPrice: string | number;
  lineTotal: string | number;
}

export interface SendOrderConfirmationDto {
  to: string;
  customerName: string;
  orderId: number;
  orderDate: string;
  status: string;
  totalAmount: string | number;
  items: OrderMailItem[];
  shipping: {
    fullName: string;
    phone: string;
    street: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
  };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendOrderConfirmation(data: SendOrderConfirmationDto): Promise<boolean> {
    try {
      this.logger.log(
        `Attempting to send order confirmation email to ${data.to} for Order #${data.orderId}`,
      );
      await this.mailerService.sendMail({
        to: data.to,
        subject: `Order Confirmed! #${data.orderId} - E-Commerce Store`,
        template: 'order-confirmation',
        context: {
          customerName: data.customerName,
          orderId: data.orderId,
          orderDate: data.orderDate,
          status: data.status,
          totalAmount: data.totalAmount,
          items: data.items,
          shipping: data.shipping,
        },
      });
      this.logger.log(
        `Order confirmation email sent successfully to ${data.to} for Order #${data.orderId}`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send order confirmation email to ${data.to} for Order #${data.orderId}: ${error?.message || error}`,
        error?.stack,
      );
      return false;
    }
  }
}
