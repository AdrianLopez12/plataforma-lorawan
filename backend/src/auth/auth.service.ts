import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organization/organization.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepository: Repository<Organization>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.seedDatabase();
  }

  async seedDatabase() {
    try {
      // 1. Seed Organizations
      const orgCount = await this.orgRepository.count();
      if (orgCount === 0) {
        console.log('Sembrando organización por defecto Plásticos Rival...');
        const rivalOrg = new Organization();
        rivalOrg.id = 'e98a1a3b-2856-4277-bbcc-04f81a7b4618';
        rivalOrg.name = 'Plásticos Rival';
        rivalOrg.description = 'Cliente industrial de medidores de agua';
        await this.orgRepository.save(rivalOrg);
        console.log('Semillado de organización completado.');
      }

      // 2. Seed Users
      const userCount = await this.userRepository.count();
      if (userCount === 0) {
        console.log('Sembrando usuarios administradores semilla...');
        
        // Super Admin
        const superUser = new User();
        superUser.name = 'Super Admin';
        superUser.email = 'super@lorawan.com';
        superUser.password = await bcrypt.hash('123456', 10);
        superUser.role = 'superadmin';
        await this.userRepository.save(superUser);

        // Admin Rival
        const rivalAdmin = new User();
        rivalAdmin.name = 'Admin Rival';
        rivalAdmin.email = 'admin@rival.com';
        rivalAdmin.password = await bcrypt.hash('123456', 10);
        rivalAdmin.role = 'admin';
        rivalAdmin.organizationId = 'e98a1a3b-2856-4277-bbcc-04f81a7b4618';
        await this.userRepository.save(rivalAdmin);

        console.log('Semillado de usuarios completado.');
      }
    } catch (error) {
      console.error('Error durante el semillado de base de datos:', error);
    }
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (user && user.password) {
      const isMatch = await bcrypt.compare(pass, user.password);
      if (isMatch) {
        const { password, ...result } = user;
        return result;
      }
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      sub: user.id,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }
}
