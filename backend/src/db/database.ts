import mysql from 'mysql2/promise';
import { logger } from '../index.js';

// MySQL 데이터베이스 설정
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'anabada',
  charset: 'utf8mb4',
  timezone: '+09:00',
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

// 데이터베이스 연결 풀
let connectionPool: mysql.Pool | null = null;

// 데이터베이스 초기화
async function initDatabase(): Promise<mysql.Pool> {
  try {
    // 연결 풀 생성
    connectionPool = mysql.createPool(DB_CONFIG);
    
    // 연결 테스트
    const connection = await connectionPool.getConnection();
    await connection.ping();
    connection.release();
    
    logger.info(`MySQL 데이터베이스 연결 성공: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    logger.info(`사용자: ${DB_CONFIG.user}`);
    
    return connectionPool;
  } catch (error: any) {
    logger.error('MySQL 데이터베이스 연결 실패:', error);
    throw error;
  }
}

// 데이터베이스 연결 풀 반환
export function getDatabase(): mysql.Pool {
  if (!connectionPool) {
    logger.error('데이터베이스 연결 풀이 초기화되지 않았습니다.');
    throw new Error('데이터베이스가 초기화되지 않았습니다. initDatabase()를 먼저 호출하세요.');
  }
  return connectionPool;
}

// 데이터베이스 연결 종료
export async function closeDatabase(): Promise<void> {
  if (connectionPool) {
    await connectionPool.end();
    logger.info('MySQL 데이터베이스 연결 종료');
    connectionPool = null;
  }
}


// 데이터베이스 설정 정보 반환
export function getDatabaseConfig() {
  return {
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    database: DB_CONFIG.database,
    user: DB_CONFIG.user,
    charset: DB_CONFIG.charset,
    timezone: DB_CONFIG.timezone
  };
}

// 비동기 초기화 실행
initDatabase().catch(error => {
  logger.error('데이터베이스 초기화 실패:', error);
  process.exit(1);
});
