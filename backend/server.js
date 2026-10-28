import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Local imports
import connectDB, { getDBStatus } from './config/db.js';
import studentRoutes from './routes/studentRoutes.js';
import authRoutes from './routes/authRoutes.js';
import opportunityRoutes from './routes/opportunityRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security HTTP headers
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));

// Request body size limits for security (prevent large payload attacks)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// General API rate limiting
app.use('/api', apiLimiter);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = getDBStatus();
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/messages', messageRoutes);

// Socket.IO Real-Time Event Handlers
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId || 'anonymous';

  if (userId !== 'anonymous') {
    socket.join(`user:${userId}`);
  }

  socket.on('join_chat', (chatId) => {
    socket.join(`chat:${chatId}`);
  });

  socket.on('send_message', (payload) => {
    const { chatId, message } = payload;
    if (chatId && message) {
      io.to(`chat:${chatId}`).emit('receive_message', {
        chatId,
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('send_notification', (payload) => {
    const { targetUserId, notification } = payload;
    if (targetUserId) {
      io.to(`user:${targetUserId}`).emit('receive_notification', notification);
    } else {
      socket.broadcast.emit('receive_notification', notification);
    }
  });

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

// 404 & Global Error Handling
app.use(notFound);
app.use(errorHandler);

// Server startup helper
export async function startServer(port = process.env.PORT || 5000) {
  await connectDB();
  return new Promise((resolve) => {
   server.listen(port, '0.0.0.0', () => {
      const actualPort = server.address().port;
      if (process.env.NODE_ENV !== 'test') {
        console.log(`===============================================`);
        console.log(`🚀 VESLocal API Server running on port ${actualPort}`);
        console.log(`📡 Health Check: http://localhost:${actualPort}/api/health`);
        console.log(`👥 Students API: http://localhost:${actualPort}/api/students`);
        console.log(`🔐 Auth API:     http://localhost:${actualPort}/api/auth`);
        console.log(`===============================================`);
      }
      resolve(server);
    });
  });
}

// Auto-start server only when not running inside a test suite
if (process.env.NODE_ENV !== 'test' && !process.argv.some(arg => arg.includes('--test'))) {
  startServer();
}

export { app, server, io };
