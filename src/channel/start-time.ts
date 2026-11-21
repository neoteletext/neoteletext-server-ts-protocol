// The real time as a running program reads the server's `start`.

/**
 * The real time, in milliseconds since the Unix epoch, at the moment a program reads a `start` the server stamped
 * `stampedMs`, the program's own clock then saying `machineMs`.
 *
 * `epoch_ms` is the server's clock as it wrote the line (DOC-1968, REQ-1476), not as the program reads it: a program the
 * server has just started reads it only once it has loaded, some hundreds of milliseconds later, and a channel that took
 * the stamp for the time of the read ran that far behind for its whole life (TODO-7165). Both transports are local
 * (DOC-1965: the program's standard input, or a Unix domain socket), so the server's clock and the program's are one
 * clock, and what it says at the read is the stamp and the line's wait together. A clock that says less than the stamp is
 * not the clock that stamped it, or was set back since, so the wait cannot be told and the stamp stands.
 */
export function timeAtRead(stampedMs: number, machineMs: number): number {
  return Math.max(stampedMs, machineMs);
}
