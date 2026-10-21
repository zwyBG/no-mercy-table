// Keep a room's commands and timed work ordered across asynchronous storage.
// A failed command must not prevent the next player from making a move.
export class RoomQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }
}
