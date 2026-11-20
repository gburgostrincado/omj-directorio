import {
  ArrayMaxSize, IsArray, IsDateString, IsEmail, IsIn, IsOptional, IsString,
  MaxLength, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException,
  Param, ParseIntPipe, Post, Put, UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './auth';
import { DatabaseService } from './database';

const roles = ['Presidente/a', 'Secretario/a', 'Tesorero/a', 'Vicepresidente/a', 'Director/a 1°', 'Otro cargo'];

class DirectorDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsIn(roles)
  role!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}

class OrganizationDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rut?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsDateString({ strict: true })
  validUntil?: string | null;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => DirectorDto)
  directors!: DirectorDto[];
}

@Injectable()
class OrganizationsService {
  constructor(private readonly db: DatabaseService) {}

  async publicList() {
    const { rows } = await this.db.query(`
      SELECT id, name, email, status FROM organizations ORDER BY name
    `);
    if (!rows.length) return [];
    const members = await this.db.query(`
      SELECT organization_id, role, name, email FROM organization_directors
      WHERE organization_id = ANY($1::int[]) AND role = ANY($2::text[])
      ORDER BY organization_id,
        CASE role WHEN 'Presidente/a' THEN 1 WHEN 'Secretario/a' THEN 2 ELSE 3 END
    `, [rows.map((row) => row.id), roles.slice(0, 3)]);
    const byOrganization = new Map<number, object[]>();
    for (const { organization_id, ...member } of members.rows) {
      const list = byOrganization.get(organization_id) ?? [];
      list.push(member);
      byOrganization.set(organization_id, list);
    }
    return rows.map((organization) => ({
      ...organization,
      directors: byOrganization.get(organization.id) ?? [],
    }));
  }

  async adminList() {
    const { rows } = await this.db.query(`
      SELECT id, name, rut, valid_until, email, status, created_at, updated_at
      FROM organizations ORDER BY name
    `);
    if (!rows.length) return [];
    const members = await this.db.query(`
      SELECT id, organization_id, role, name, address, email, phone
      FROM organization_directors WHERE organization_id = ANY($1::int[])
      ORDER BY organization_id, id
    `, [rows.map((row) => row.id)]);
    const byOrganization = new Map<number, object[]>();
    for (const { organization_id, ...member } of members.rows) {
      const list = byOrganization.get(organization_id) ?? [];
      list.push(member);
      byOrganization.set(organization_id, list);
    }
    return rows.map((organization) => ({
      ...organization,
      directors: byOrganization.get(organization.id) ?? [],
    }));
  }

  async create(input: OrganizationDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        INSERT INTO organizations (name, rut, valid_until, email, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, rut, valid_until, email, status, created_at, updated_at
      `, this.values(input));
      await this.saveDirectors(client, rows[0].id, input.directors);
      await client.query('COMMIT');
      return { ...rows[0], directors: input.directors };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: number, input: OrganizationDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        UPDATE organizations SET name = $1, rut = $2, valid_until = $3,
          email = $4, status = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING id, name, rut, valid_until, email, status, created_at, updated_at
      `, [...this.values(input), id]);
      if (!rows[0]) throw new NotFoundException('No se encontró la organización.');
      await client.query('DELETE FROM organization_directors WHERE organization_id = $1', [id]);
      await this.saveDirectors(client, id, input.directors);
      await client.query('COMMIT');
      return { ...rows[0], directors: input.directors };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(id: number) {
    const { rowCount } = await this.db.query('DELETE FROM organizations WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundException('No se encontró la organización.');
    return { ok: true };
  }

  private values(input: OrganizationDto) {
    return [input.name, input.rut || null, input.validUntil || null, input.email || null, input.status];
  }

  private async saveDirectors(client: import('pg').PoolClient, organizationId: number, directors: DirectorDto[]) {
    for (const director of directors) {
      await client.query(`
        INSERT INTO organization_directors (organization_id, role, name, address, email, phone)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [organizationId, director.role, director.name, director.address || null,
        director.email || null, director.phone || null]);
    }
  }
}

@Controller('organizations')
class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  publicList() { return this.organizations.publicList(); }

  @Get('admin')
  @UseGuards(AdminGuard)
  adminList() { return this.organizations.adminList(); }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() body: OrganizationDto) { return this.organizations.create(body); }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: OrganizationDto) {
    return this.organizations.update(id, body);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  remove(@Param('id', ParseIntPipe) id: number) { return this.organizations.remove(id); }
}

@Module({ controllers: [OrganizationsController], providers: [OrganizationsService] })
export class OrganizationsModule {}
