import { BoundaryError } from "./errors.js";

export class GroupFeedCursorError extends BoundaryError {
  constructor() {
    super("group_feed_invalid_cursor");
  }
}
