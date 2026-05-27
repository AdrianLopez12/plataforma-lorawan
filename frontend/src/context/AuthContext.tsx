import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, Role, Organization } from '../types';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasRole: (roles: Role[]) => boolean;
  
  // Clientes (Organizaciones) CRUD
  clients: Organization[];
  addClient: (name: string, description?: string, parentId?: string) => Organization;
  updateClient: (id: string, name: string, description?: string) => void;
  deleteClient: (id: string) => void;
  
  // Usuarios CRUD
  users: User[];
  addUser: (name: string, email: string, role: Role, organizationId?: string, password?: string) => User;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;
  changeUserPassword: (id: string, newPass: string) => void;
  changeOwnPassword: (currentPass: string, newPass: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_CLIENTS: Organization[] = [
  { id: 'plasticos_rival', name: 'Plásticos Rival', description: 'Cliente industrial de medidores de agua', createdAt: new Date().toISOString() }
];

const DEFAULT_USERS: User[] = [
  { id: '1', name: 'Super Admin', email: 'super@lorawan.com', password: '123456', role: 'superadmin', createdAt: new Date().toISOString() },
  { id: '5', name: 'Admin Rival', email: 'admin@rival.com', password: '123456', role: 'admin', organizationId: 'plasticos_rival', createdAt: new Date().toISOString() }
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Sembrar datos e inicializar
  useEffect(() => {
    // Migración nuclear única para purgar toda la base local (dashboards, grupos, alarmas, sesiones, etc.)
    if (!localStorage.getItem('db_wipe_v12')) {
      localStorage.clear();
      localStorage.setItem('custom_clients', JSON.stringify(DEFAULT_CLIENTS));
      localStorage.setItem('custom_users', JSON.stringify(DEFAULT_USERS));
      localStorage.setItem('db_wipe_v12', 'true');
      window.location.reload();
      return;
    }

    // 1. Clientes - Cargar de localStorage o sembrar asegurando que Plásticos Rival esté presente
    const storedClients = localStorage.getItem('custom_clients');
    let parsedClients = DEFAULT_CLIENTS;
    if (storedClients) {
      try {
        const parsed = JSON.parse(storedClients);
        // Asegurar que Plásticos Rival está presente
        if (!parsed.some((c: any) => c.id === 'plasticos_rival')) {
          parsed.push({ id: 'plasticos_rival', name: 'Plásticos Rival', description: 'Cliente industrial de medidores de agua', createdAt: new Date().toISOString() });
        }
        parsedClients = parsed;
      } catch (e) {
        console.error("Error parsing custom_clients:", e);
      }
    }
    localStorage.setItem('custom_clients', JSON.stringify(parsedClients));
    setClients(parsedClients);

    // 2. Usuarios - Cargar de localStorage o sembrar asegurando que los predeterminados existan
    const storedUsers = localStorage.getItem('custom_users');
    let parsedUsers = DEFAULT_USERS;
    if (storedUsers) {
      try {
        const parsed = JSON.parse(storedUsers);
        DEFAULT_USERS.forEach((defaultUser) => {
          if (!parsed.some((u: any) => u.email.toLowerCase() === defaultUser.email.toLowerCase())) {
            parsed.push(defaultUser);
          }
        });
        parsedUsers = parsed;
      } catch (e) {
        console.error("Error parsing custom_users:", e);
      }
    }
    localStorage.setItem('custom_users', JSON.stringify(parsedUsers));
    setUsers(parsedUsers);

    // 3. Cargar sesión activa
    const storedSessionUser = localStorage.getItem('user');
    if (storedSessionUser) {
      try {
        const parsedSession = JSON.parse(storedSessionUser) as User;
        const matched = parsedUsers.find((u: User) => u.id === parsedSession.id);
        if (matched) {
          const { password: _, ...userWithoutPass } = matched;
          setUser(userWithoutPass);
        } else {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
        }
      } catch (e) {
        console.error("Error parsing stored user:", e);
      }
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Buscar en la base de usuarios dinámicos actualizados
    const currentUsers = JSON.parse(localStorage.getItem('custom_users') || '[]');
    const found = currentUsers.find((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    
    if (found) {
      const { password: _, ...userWithoutPass } = found;
      setUser(userWithoutPass);
      localStorage.setItem('user', JSON.stringify(userWithoutPass));
      localStorage.setItem('token', 'mock-token-' + found.id);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const hasRole = (roles: Role[]) => !!user && roles.includes(user.role);

  // --- CLIENTS CRUD ---
  const saveClientsToStore = (newClients: Organization[]) => {
    setClients(newClients);
    localStorage.setItem('custom_clients', JSON.stringify(newClients));
  };

  const addClient = (name: string, description?: string, parentId?: string): Organization => {
    const newClient: Organization = {
      id: 'org_' + Math.random().toString(36).substring(2, 9),
      name,
      description: description || '',
      parentId,
      createdAt: new Date().toISOString()
    };
    saveClientsToStore([...clients, newClient]);
    return newClient;
  };

  const updateClient = (id: string, name: string, description?: string) => {
    const updated = clients.map((c) => 
      c.id === id ? { ...c, name, description: description || '' } : c
    );
    saveClientsToStore(updated);
  };

  const deleteClient = (id: string) => {
    // Elimina el cliente
    const updated = clients.filter((c) => c.id !== id);
    saveClientsToStore(updated);
    
    // También desasocia a los usuarios de ese cliente poniéndolos en null o quitándolos
    const currentUsers: User[] = JSON.parse(localStorage.getItem('custom_users') || '[]');
    const updatedUsers = currentUsers.map((u) => 
      u.organizationId === id ? { ...u, organizationId: undefined } : u
    );
    setUsers(updatedUsers);
    localStorage.setItem('custom_users', JSON.stringify(updatedUsers));
  };

  // --- USERS CRUD ---
  const saveUsersToStore = (newUsers: User[]) => {
    setUsers(newUsers);
    localStorage.setItem('custom_users', JSON.stringify(newUsers));
  };

  const addUser = (name: string, email: string, role: Role, organizationId?: string, password?: string): User => {
    const newUser: User = {
      id: 'user_' + Math.random().toString(36).substring(2, 9),
      name,
      email,
      role,
      organizationId: role === 'superadmin' ? undefined : organizationId,
      password: password || '123456', // Contraseña por defecto si no se pasa
      createdAt: new Date().toISOString()
    };
    saveUsersToStore([...users, newUser]);
    return newUser;
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    const updated = users.map((u) => {
      if (u.id === id) {
        const merged = { ...u, ...updates };
        if (merged.role === 'superadmin') {
          delete merged.organizationId;
        }
        return merged;
      }
      return u;
    });
    saveUsersToStore(updated);

    // Si el usuario editado es el logueado actualmente, refrescar su sesión
    if (user && user.id === id) {
      const activeUser = updated.find((u) => u.id === id);
      if (activeUser) {
        const { password: _, ...userWithoutPass } = activeUser;
        setUser(userWithoutPass);
        localStorage.setItem('user', JSON.stringify(userWithoutPass));
      }
    }
  };

  const deleteUser = (id: string) => {
    const target = users.find((u) => u.id === id);
    if (target && target.role === 'superadmin') {
      console.warn("Intento de eliminación de Super Administrador bloqueado.");
      return;
    }
    const updated = users.filter((u) => u.id !== id);
    saveUsersToStore(updated);
    
    // Si se auto-elimina (caso extremo), cerrar sesión
    if (user && user.id === id) {
      logout();
    }
  };

  const changeUserPassword = (id: string, newPass: string) => {
    const updated = users.map((u) => 
      u.id === id ? { ...u, password: newPass } : u
    );
    saveUsersToStore(updated);
  };

  const changeOwnPassword = async (currentPass: string, newPass: string): Promise<boolean> => {
    if (!user) return false;
    
    const currentUsers = JSON.parse(localStorage.getItem('custom_users') || '[]');
    const matchIndex = currentUsers.findIndex((u: any) => u.id === user.id);
    
    if (matchIndex === -1) return false;
    
    const dbUser = currentUsers[matchIndex];
    if (dbUser.password !== currentPass) {
      return false; // Contraseña actual no coincide
    }
    
    // Actualizar contraseña
    dbUser.password = newPass;
    currentUsers[matchIndex] = dbUser;
    
    setUsers(currentUsers);
    localStorage.setItem('custom_users', JSON.stringify(currentUsers));
    return true;
  };

  return (
    <AuthContext.Provider value={{ 
      user, login, logout, hasRole,
      clients, addClient, updateClient, deleteClient,
      users, addUser, updateUser, deleteUser, changeUserPassword, changeOwnPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
