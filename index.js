require('dotenv').config();

const express = require('express');
const http = require('http');
const redis = require('redis');
const socketIo = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseAnonKey } = require('./config');

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Anon Key:', supabaseAnonKey);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const redisClient = redis.createClient();

redisClient.on('error', (err) => {
  console.log('Redis error: ', err);
});

// Connect to Redis
(async () => {
  await redisClient.connect();
  console.log('Connected to Redis!');
})();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  }
});

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('<h1>Reddit Place Clone Backend</h1>');
});

const CANVAS_SIZE = 50;
const COOLDOWN_SECONDS = 20;

io.on('connection', async (socket) => {
  console.log('a user connected');

  socket.on('login', async (username) => {
    console.log("Login attempt for username:", username);
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();
    console.log("data: ", data);

    if (data) {
      socket.username = username;
      socket.emit('login_success');

      // Calculate and send initial cooldown using the existing 'cooldown' event
      const lastDrawTime = await redisClient.get(`last_draw_time:${socket.username}`);
      const now = Date.now();
      let remainingCooldown = 0;
      if (lastDrawTime && now - lastDrawTime < COOLDOWN_SECONDS * 1000) {
        remainingCooldown = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - lastDrawTime)) / 1000);
      }
      socket.emit('cooldown', remainingCooldown);

    } else {
      socket.emit('login_failed');
    }
  });

  socket.on('signup', async (username) => {
    console.log("Signup attempt for username:", username);
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      socket.emit('signup_failed', 'Username already taken.');
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .insert([{ username: username }]);

    if (error) {
      console.log('Error signing up user:', error);
      socket.emit('signup_failed', 'An error occurred during signup.');
    } else {
      socket.username = username;
      socket.emit('signup_success');
    }
  });

  const canvas = await redisClient.hGetAll('canvas');
  const parsedCanvas = {};
  for (const key in canvas) {
    parsedCanvas[key] = JSON.parse(canvas[key]);
  }
  socket.emit('initial_canvas', parsedCanvas);

  socket.on('draw_pixel', async (data) => {
    if (!socket.username) {
      return;
    }

    const lastDrawTimeStr = await redisClient.get(`last_draw_time:${socket.username}`);
    const lastDrawTime = lastDrawTimeStr ? parseInt(lastDrawTimeStr, 10) : null;

    const now = Date.now();
    if (lastDrawTime && now - lastDrawTime < COOLDOWN_SECONDS * 1000) {
      const remainingCooldown = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - lastDrawTime)) / 1000);
      socket.emit('cooldown', remainingCooldown);
      return;
    }

    console.log('draw_pixel', data);
    const { x, y, color, timestamp } = data;
    if (x >= 0 && x < CANVAS_SIZE && y >= 0 && y < CANVAS_SIZE) {
      const existingPixel = await redisClient.hGet('canvas', `${x}:${y}`);

      let shouldUpdate = true;
      if (existingPixel) {
        const parsedPixel = JSON.parse(existingPixel);
        if (parsedPixel.timestamp && parsedPixel.timestamp > timestamp) {
          shouldUpdate = false;
        }
      }

      if (shouldUpdate) {
        const pixelData = JSON.stringify({ color, timestamp });
        await redisClient.hSet('canvas', `${x}:${y}`, pixelData);
        await redisClient.set(`last_draw_time:${socket.username}`, now);
        socket.broadcast.emit('update_pixel', { x, y, color, timestamp });
        socket.emit('cooldown', COOLDOWN_SECONDS);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);

  const backupCanvasToSupabase = async () => {
    const canvas = await redisClient.hGetAll('canvas');

    const currentCanvasJson = JSON.stringify(canvas);

    // Fetch the latest backup from Supabase
    const { data: latestBackup, error: fetchError } = await supabase
      .from('canvas_backups')
      .select('canvas_data')
      .order('timestamp', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.log('Error fetching latest backup from Supabase:', fetchError);
      return;
    }

    if (latestBackup && latestBackup.length > 0 && latestBackup[0].canvas_data === currentCanvasJson) {
      console.log('Canvas state unchanged, no backup needed at', new Date().toISOString());
      return;
    }

    const { data, error } = await supabase
      .from('canvas_backups')
      .insert([
        { timestamp: new Date().toISOString(), canvas_data: currentCanvasJson },
      ]);

    if (error) {
      console.log('Error backing up canvas to Supabase:', error);
    } else {
      console.log('Canvas backed up to Supabase at', new Date().toISOString());
    }
  };

  // Run backup immediately on startup and then every 12 hours (12 * 60 * 60 * 1000 ms)
  backupCanvasToSupabase();
  setInterval(backupCanvasToSupabase, 12 * 60 * 60 * 1000);
});
