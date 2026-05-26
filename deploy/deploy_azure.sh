#!/bin/bash

# ==============================================================================
# Script de Despliegue Automatizado para Azure VM
# Aplicación: Servidor LoRaWAN con Monitoreo Multi-tenant de Medidores de Agua
# ==============================================================================

# Colores para salida en terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${GREEN}      INICIANDO INSTALACIÓN Y CONFIGURACIÓN EN LA VM DE AZURE${NC}"
echo -e "${BLUE}======================================================================${NC}"

# Verificar privilegios de administrador
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Por favor, ejecuta este script como root o usando sudo.${NC}"
  exit 1
fi

# 1. Solicitar Variables de Configuración al Iniciar
echo -e "${YELLOW}>>> Configuración de Dominio y Seguridad:${NC}"
read -p "Ingresa el nombre de dominio apuntado a esta VM (ej: rival.tudominio.com): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}Error: Se requiere un nombre de dominio para configurar Nginx y SSL.${NC}"
    exit 1
fi

read -p "Ingresa una contraseña segura para PostgreSQL (deja en blanco para generar una aleatoria): " DB_PASSWORD
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 20)
    echo -e "${GREEN}Contraseña autogenerada para la BD: ${DB_PASSWORD}${NC}"
fi

read -p "Ingresa un secreto fuerte para JWT (deja en blanco para generar uno aleatorio): " JWT_SECRET
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -base64 32)
    echo -e "${GREEN}Secreto JWT generado con éxito.${NC}"
fi

# 2. Actualizar el Sistema Operativo
echo -e "${YELLOW}\n[1/7] Actualizando paquetes del sistema...${NC}"
apt update && apt upgrade -y

# 3. Instalar Dependencias del Sistema (Git, Curl, Docker, Nginx)
echo -e "${YELLOW}\n[2/7] Instalando dependencias de software esenciales...${NC}"
apt install -y git curl build-essential nginx certbot python3-certbot-nginx

# Instalar Docker
if ! [ -x "$(command -v docker)" ]; then
    echo -e "${BLUE}Instalando Docker Engine...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker $SUDO_USER
    rm get-docker.sh
fi

# Instalar Docker Compose
if ! [ -x "$(command -v docker-compose)" ]; then
    echo -e "${BLUE}Instalando Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Instalar Node.js v20 LTS
if ! [ -x "$(command -v node)" ]; then
    echo -e "${BLUE}Instalando Node.js v20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Instalar PM2 globalmente (Gestor de Procesos en producción)
echo -e "${BLUE}Instalando PM2 (Process Manager)...${NC}"
npm install -g pm2

# 4. Crear estructura del proyecto e implementar código
echo -e "${YELLOW}\n[3/7] Preparando estructura del código en /var/www/...${NC}"
mkdir -p /var/www/lorawan-app
cp -r ../backend /var/www/lorawan-app/
cp -r ../frontend /var/www/lorawan-app/
cp docker-compose.prod.yml /var/www/lorawan-app/
cp nginx.conf /var/www/lorawan-app/

cd /var/www/lorawan-app/

# 5. Generar Variables de Entorno (.env) de Producción
echo -e "${YELLOW}\n[4/7] Configurando entornos de producción (.env)...${NC}"

# Crear .env en el Backend
cat <<EOT > backend/.env
NODE_ENV=production
APP_PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=lora_admin
DB_PASS=${DB_PASSWORD}
DB_NAME=lorawan_app
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=https://${DOMAIN_NAME}
EOT

# Crear .env en el Frontend
cat <<EOT > frontend/.env
VITE_API_URL=https://${DOMAIN_NAME}/api
EOT

# 6. Levantar PostgreSQL Seguro (Docker Compose)
echo -e "${YELLOW}\n[5/7] Inicializando base de datos PostgreSQL...${NC}"
export DB_USER=lora_admin
export DB_PASS=${DB_PASSWORD}
export DB_NAME=lorawan_app
docker-compose -f docker-compose.prod.yml up -d

# 7. Compilar y Levantar el Backend (NestJS con PM2)
echo -e "${YELLOW}\n[6/7] Instalando y compilando el Servidor Backend (NestJS)...${NC}"
cd backend
npm install
npm run build

# Levantar con PM2
pm2 delete lorawan-backend 2>/dev/null || true
pm2 start dist/src/main.js --name "lorawan-backend" --env production
pm2 save
pm2 startup

cd ..

# 8. Compilar y Servir el Frontend (React + Nginx)
echo -e "${YELLOW}\n[7/7] Instalando y compilando el Portal Web (React)...${NC}"
cd frontend
npm install
npm run build

cd ..

# Configurar Nginx para servir los recursos
echo -e "${YELLOW}Configurando Nginx y activando el proxy inverso seguro...${NC}"
sed -i "s/YOUR_DOMAIN_OR_IP/${DOMAIN_NAME}/g" nginx.conf
cp nginx.conf /etc/nginx/sites-available/lorawan-app
ln -sf /etc/nginx/sites-available/lorawan-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Probar y reiniciar Nginx
nginx -t && systemctl restart nginx

# 9. Ofrecer Instalación del Certificado SSL Let's Encrypt
echo -e "${BLUE}======================================================================${NC}"
echo -e "${GREEN}      ¡FELICIDADES! LA INFRAESTRUCTURA BÁSICA HA SIDO INSTALADA${NC}"
echo -e "${BLUE}======================================================================${NC}"
echo -e "\n${YELLOW}¿Quieres activar el cifrado HTTPS seguro con Let's Encrypt SSL automáticamente ahora?${NC}"
echo -e "Nota: Asegúrate de que el dominio '${DOMAIN_NAME}' ya esté apuntado correctamente a la IP de esta VM en tu DNS."
read -p "(s/n): " RUN_SSL

if [ "$RUN_SSL" = "s" ] || [ "$RUN_SSL" = "S" ]; then
    echo -e "${BLUE}Solicitando certificado SSL a Let's Encrypt para: ${DOMAIN_NAME}...${NC}"
    certbot --nginx -d ${DOMAIN_NAME} --non-interactive --agree-tos --email admin@${DOMAIN_NAME} --redirect
    
    # Descomentar redirección en nginx si certbot no lo hizo
    sed -i 's/# return 301/return 301/g' /etc/nginx/sites-available/lorawan-app
    systemctl reload nginx
    echo -e "${GREEN}¡Felicidades! HTTPS está completamente activo en: https://${DOMAIN_NAME}${NC}"
else
    echo -e "${YELLOW}SSL omitido. Recuerda que puedes correr este comando manualmente más tarde:${NC}"
    echo -e "  sudo certbot --nginx -d ${DOMAIN_NAME}"
fi

echo -e "\n${GREEN}Estado del Despliegue:${NC}"
echo -e "- Base de datos Postgres: Corriendo en Docker"
echo -e "- Backend NestJS:         Corriendo bajo control de PM2 en puerto 3000"
echo -e "- Frontend React:        Compilado y servido por Nginx en /var/www/lorawan-app/frontend/dist"
echo -e "- Acceso Web:            http://${DOMAIN_NAME} (o https://${DOMAIN_NAME} si activaste SSL)"
echo -e "${BLUE}======================================================================${NC}"
