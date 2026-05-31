/**
 * NHI 71기 신임관리자과정(공채)
 * 국립공원 봉사활동 · 지방현장체험 장소 선정 시스템
 *
 * 실행: node server.js
 * 분임장 접속: http://[서버IP]:3000
 * 운영자 화면: http://[서버IP]:3000/admin.html
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/player.html'));

// ─── Application State ───────────────────────────────────────────────────────

let state = {
  votes: {},             // { "1": { park: 70.0, region: 30.0 }, ... }
  phase: 'collecting',   // 'collecting' | 'revealed'
  parkAssignments: {},   // { "1": "지리산", ... }
  regionAssignments: {}, // { "1": "부산", ... }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const addr of list) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return 'localhost';
}

function voteCount() {
  return Object.keys(state.votes).length;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => {
  res.json({
    votes: state.votes,
    phase: state.phase,
    parkAssignments: state.parkAssignments,
    regionAssignments: state.regionAssignments,
    voteCount: voteCount(),
    serverIP: getLocalIP(),
  });
});

/** 분임장 점수 제출 */
app.post('/api/submit', (req, res) => {
  const { groupNum, parkPoints } = req.body;
  const num = parseInt(groupNum);

  if (isNaN(num) || num < 1 || num > 18) {
    return res.status(400).json({ error: '분임 번호는 1~18 사이여야 합니다.' });
  }
  if (state.phase !== 'collecting') {
    return res.status(400).json({ error: '입력 시간이 종료되었습니다.' });
  }
  if (state.votes[String(num)]) {
    return res.status(400).json({ error: '이미 입력이 완료된 분임입니다.' });
  }

  const park = Math.round(parseFloat(parkPoints) * 10) / 10;
  if (isNaN(park) || park < 0 || park > 100) {
    return res.status(400).json({ error: '점수는 0~100 사이의 숫자여야 합니다.' });
  }
  const region = Math.round((100 - park) * 10) / 10;

  state.votes[String(num)] = { park, region };

  io.emit('vote-update', {
    groupNum: num,
    vote: { park, region },
    voteCount: voteCount(),
  });

  res.json({ success: true });
});

/** 결과 공개 (운영자) */
app.post('/api/reveal', (req, res) => {
  const count = voteCount();
  if (count < 18) {
    return res.status(400).json({ error: `아직 ${18 - count}개 분임이 미입력 상태입니다.` });
  }
  state.phase = 'revealed';
  io.emit('phase-change', { phase: 'revealed', votes: state.votes });
  res.json({ success: true });
});

/** 강제 결과 공개 (운영자 - 미입력 분임이 있어도 강행) */
app.post('/api/force-reveal', (req, res) => {
  state.phase = 'revealed';
  io.emit('phase-change', { phase: 'revealed', votes: state.votes });
  res.json({ success: true });
});

/** 국립공원 배정 기록 */
app.post('/api/assign-park', (req, res) => {
  const { groupNum, park } = req.body;
  state.parkAssignments[String(groupNum)] = park;
  io.emit('park-assigned', { groupNum, park });
  res.json({ success: true });
});

/** 지방 배정 기록 */
app.post('/api/assign-region', (req, res) => {
  const { groupNum, region } = req.body;
  state.regionAssignments[String(groupNum)] = region;
  io.emit('region-assigned', { groupNum, region });
  res.json({ success: true });
});

/** 전체 초기화 */
app.post('/api/reset', (req, res) => {
  state = {
    votes: {},
    phase: 'collecting',
    parkAssignments: {},
    regionAssignments: {},
  };
  io.emit('reset');
  res.json({ success: true });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // 신규 접속자에게 현재 상태 전송
  socket.emit('init', {
    votes: state.votes,
    phase: state.phase,
    voteCount: voteCount(),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   NHI 71기 장소 선정 시스템이 실행 중입니다        ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log(`║   분임장 접속 : http://${ip}:${PORT}               `);
  console.log(`║   운영자 화면 : http://${ip}:${PORT}/admin.html    `);
  console.log(`║   로컬 주소   : http://localhost:${PORT}           `);
  console.log('╚════════════════════════════════════════════════════╝\n');
});
