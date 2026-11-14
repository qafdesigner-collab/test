import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { CommerceService } from './commerce.service';
import { CreateOrderDto, CreateProductDto, NewVersionDto, OrderQuery, ProductQuery, UpdateOrderDto, UpdateProductDto, UpdateVersionDto } from './commerce.dto';

const Id = () => new ParseUUIDPipe();
const CATALOG_READ = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR', 'PUBLISHER_SALES'];
const CATALOG_WRITE = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'];
const SALES = ['PUBLISHER_ADMIN', 'PUBLISHER_SALES'];

@ApiTags('commerce')
@Controller('commerce')
export class CommerceController {
  constructor(private readonly svc: CommerceService) {}

  @Roles(...CATALOG_READ) @Get('products') products(@Query() q: ProductQuery) { return this.svc.listProducts(q); }
  @Roles(...CATALOG_READ) @Get('sellable-editions') editions() { return this.svc.sellableEditions(); }
  @Roles(...CATALOG_WRITE) @Post('products') create(@Body() d: CreateProductDto) { return this.svc.createProduct(d); }
  @Roles(...CATALOG_READ) @Get('products/:id') get(@Param('id', Id()) id: string) { return this.svc.getProduct(id); }
  @Roles(...CATALOG_WRITE) @Patch('products/:id') update(@Param('id', Id()) id: string, @Body() d: UpdateProductDto) { return this.svc.updateProduct(id, d); }
  @Roles(...CATALOG_WRITE) @Post('products/:id/versions') newVersion(@Param('id', Id()) id: string, @Body() d: NewVersionDto) { return this.svc.newVersion(id, d.copyFromVersionId); }
  @Roles(...CATALOG_WRITE) @Patch('versions/:id') updVersion(@Param('id', Id()) id: string, @Body() d: UpdateVersionDto) { return this.svc.updateVersion(id, d); }
  @Roles(...CATALOG_WRITE) @Post('versions/:id/activate') activate(@Param('id', Id()) id: string) { return this.svc.activateVersion(id); }
  @Roles(...CATALOG_WRITE) @Post('versions/:id/retire') retire(@Param('id', Id()) id: string) { return this.svc.retireVersion(id); }
  @Roles(...CATALOG_WRITE) @Delete('versions/:id') delVersion(@Param('id', Id()) id: string) { return this.svc.deleteVersion(id); }

  @Roles(...SALES) @Get('orders') orders(@Query() q: OrderQuery) { return this.svc.listOrders(q); }
  @Roles(...SALES) @Post('orders') createOrder(@Body() d: CreateOrderDto) { return this.svc.createOrder(d); }
  @Roles(...SALES) @Get('orders/:id') order(@Param('id', Id()) id: string) { return this.svc.getOrder(id); }
  @Roles(...SALES) @Patch('orders/:id') updOrder(@Param('id', Id()) id: string, @Body() d: UpdateOrderDto) { return this.svc.updateOrder(id, d); }
  @Roles(...SALES) @Post('orders/:id/confirm') confirm(@Param('id', Id()) id: string) { return this.svc.confirmOrder(id); }
  @Roles(...SALES) @Post('orders/:id/cancel') cancel(@Param('id', Id()) id: string) { return this.svc.cancelOrder(id); }
  /** Issuing licences is restricted to publisher admins. */
  @Roles('PUBLISHER_ADMIN') @Post('orders/:id/fulfil') fulfil(@Param('id', Id()) id: string) { return this.svc.fulfilOrder(id); }
}
