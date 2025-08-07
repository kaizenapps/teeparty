# Golf Booking Automation System

An automated golf tee time booking system for Trump National Golf Club Colts Neck. The system continuously monitors for available slots and automatically books them when they become available in your preferred time range.

## 🏌️‍♂️ Features

- **Automated Booking**: Books tee times as soon as slots become available
- **Smart Scheduling**: Waits for optimal booking windows or checks continuously
- **Time Range Filtering**: Only books within your preferred time range
- **User Management**: Stores golf club credentials securely
- **Guest Management**: Pre-configured guest list for 4-person bookings
- **Booking History**: Tracks all attempts and successful bookings
- **Real-time Monitoring**: Runs every minute checking for opportunities

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- MySQL database
- Cron jobs for scheduling
- Axios for HTTP requests
- Cheerio for HTML parsing

**Frontend:**
- React + Vite
- Modern UI components
- Real-time booking status

## 📋 Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Golf club account credentials
- Port 3001 (backend) and 5173 (frontend) available

## 🚀 Development Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd tee
```

### 2. Backend Setup
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Database Setup
```sql
CREATE DATABASE golf_booking;
-- Import schema from database/schema.sql
```

### 4. Frontend Setup
```bash
cd ../
npm install
```

### 5. Start Development
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
npm run dev
```

## 🌐 Production Deployment

### Option 1: VPS/Cloud Server (Recommended)

#### 1. **Server Setup**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MySQL
sudo apt install mysql-server -y
sudo mysql_secure_installation

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx (optional, for reverse proxy)
sudo apt install nginx -y
```

#### 2. **Deploy Application**
```bash
# Clone repository
git clone <your-repo-url> /var/www/golf-booking
cd /var/www/golf-booking

# Backend setup
cd backend
npm install --production
cp .env.example .env
# Configure .env with production values

# Frontend build
cd ../
npm install
npm run build

# Setup database
mysql -u root -p
CREATE DATABASE golf_booking;
# Import your schema
```

#### 3. **Environment Configuration**
```bash
# backend/.env
NODE_ENV=production
PORT=3001
DB_HOST=localhost
DB_USER=golf_user
DB_PASSWORD=your_secure_password
DB_NAME=golf_booking
```

#### 4. **Start with PM2**
```bash
cd /var/www/golf-booking/backend

# Start backend with PM2
pm2 start server.js --name "golf-backend"

# Save PM2 configuration
pm2 save
pm2 startup

# Serve frontend with PM2 (using serve)
npm install -g serve
cd ../
pm2 start "serve -s dist -l 5173" --name "golf-frontend"
```

#### 5. **Nginx Configuration** (Optional)
```nginx
# /etc/nginx/sites-available/golf-booking
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/golf-booking /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Option 2: Docker Deployment

#### 1. **Create Dockerfile**
```dockerfile
# backend/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

#### 2. **Docker Compose**
```yaml
# docker-compose.yml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - DB_HOST=mysql
      - DB_USER=golf_user
      - DB_PASSWORD=secure_password
      - DB_NAME=golf_booking
    depends_on:
      - mysql

  frontend:
    build: .
    ports:
      - "5173:5173"

  mysql:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=root_password
      - MYSQL_DATABASE=golf_booking
      - MYSQL_USER=golf_user
      - MYSQL_PASSWORD=secure_password
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

```bash
docker-compose up -d
```

### Option 3: Railway/Render/Heroku

#### Railway Deployment
1. Connect GitHub repository to Railway
2. Add MySQL plugin
3. Set environment variables
4. Deploy automatically on push

#### Render Deployment
1. Create new Web Service from GitHub
2. Add PostgreSQL database
3. Set environment variables
4. Auto-deploy on commits

## 🔧 Configuration

### 1. **Golf Club Credentials**
- Use the frontend to securely store your golf club login
- Credentials are encrypted and stored in database

### 2. **Guest List**
- Configure your regular playing partners in the database
- System automatically uses first 3 active guests + member

### 3. **Booking Preferences**
- Set preferred time ranges (e.g., 5:30 PM - 8:00 PM)
- System will only book within these hours

## 📊 Monitoring

### PM2 Monitoring
```bash
pm2 status
pm2 logs golf-backend
pm2 restart golf-backend
```

### Database Health
```sql
SELECT * FROM booking_preferences WHERE status = 'pending';
SELECT * FROM booking_logs ORDER BY created_at DESC LIMIT 10;
```

### API Health Check
```
GET /api/health
```

## 🔐 Security Considerations

- Change all default passwords
- Use environment variables for secrets
- Enable SSL/HTTPS in production
- Regularly update dependencies
- Monitor access logs
- Backup database regularly

## 🆘 Troubleshooting

### Common Issues
1. **Cron not running**: Check PM2 status and logs
2. **Authentication fails**: Verify golf club credentials
3. **No bookings found**: Check time ranges and availability
4. **Database errors**: Verify MySQL connection and permissions

### Support
Check application logs and booking_logs table for detailed error information.

## 📝 License

Private use only - Golf booking automation system.