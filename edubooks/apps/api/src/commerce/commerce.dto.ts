import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ProductQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['SINGLE', 'BUNDLE']) kind?: 'SINGLE' | 'BUNDLE';
  @IsOptional() @IsIn(['true', 'false']) includeArchived?: string;
}
export class CreateProductDto {
  @ApiProperty({ example: 'KG-ENG-PKG' }) @IsString() @Matches(/^[A-Za-z0-9._-]{2,40}$/, { message: 'SKU: 2–40 letters, digits, dot, dash or underscore' }) sku: string;
  @ApiProperty() @IsString() @Length(2, 160) name: string;
  @ApiProperty({ enum: ['SINGLE', 'BUNDLE'] }) @IsEnum(['SINGLE', 'BUNDLE']) kind: 'SINGLE' | 'BUNDLE';
  @ApiPropertyOptional() @IsOptional() @IsUUID() gradeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ type: [String], description: 'Published book editions included' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('all', { each: true }) editionIds: string[];
  @ApiPropertyOptional({ description: 'Price per seat in minor units (e.g. paisa/cents)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMinor?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
}
export class UpdateProductDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsUUID() gradeId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}
export class NewVersionDto {
  @IsOptional() @IsUUID() copyFromVersionId?: string;
}
export class UpdateVersionDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('all', { each: true }) editionIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMinor?: number | null;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class OrderLineDto {
  @ApiProperty() @IsUUID() productVersionId: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100000) studentQty: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(10000) teacherQty: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) unitPriceMinor?: number;
}
export class CreateOrderDto {
  @ApiProperty() @IsUUID() schoolId: string;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiProperty({ enum: ['NEW', 'RENEWAL', 'ADDITIONAL'] }) @IsEnum(['NEW', 'RENEWAL', 'ADDITIONAL']) type: 'NEW' | 'RENEWAL' | 'ADDITIONAL';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @ApiProperty({ type: [OrderLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderLineDto) lines: OrderLineDto[];
}
export class UpdateOrderDto {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderLineDto) lines?: OrderLineDto[];
}
export class OrderQuery extends PageQuery {
  @IsOptional() @IsUUID() schoolId?: string;
  @IsOptional() @IsIn(['DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED']) status?: string;
}
