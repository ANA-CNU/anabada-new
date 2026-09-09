import { pino } from "pino";

/** 마이그레이터의 비밀값 비노출 구조화 로그를 생성한다. */
export function createLogger() {
  return pino({
    level: "info",
    redact: ["password", "DB_PASSWORD", "*.password"],
  });
}
