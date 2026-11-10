import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
/** Endpoint needs no session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Endpoint requires at least one of these roles. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);
export const PUBLISHER_STAFF = ['PUBLISHER_ADMIN', 'PUBLISHER_EDITOR'];
export const Ctx = createParamDecorator((_d: unknown, c: ExecutionContext) => c.switchToHttp().getRequest().ctx);
/** Don't open the tenant transaction automatically (e.g. long uploads: open it after the file is received). */
export const MANUAL_TX = 'manualTx';
export const ManualTx = () => SetMetadata(MANUAL_TX, true);
