export class EventNotFoundError extends Error {
  readonly name = "EventNotFoundError";
  constructor(readonly eventId: number) {
    super("해당 이벤트를 찾을 수 없습니다.");
  }
}
