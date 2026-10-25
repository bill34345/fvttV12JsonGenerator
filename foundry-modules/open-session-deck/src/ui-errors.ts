/** Invoke immediately so popout opening keeps the user's click gesture. */
export function runDeckUiAction(action: () => Promise<unknown>, messageKey = 'OSD.Notifications.ActionFailed'): void {
  function report(error: unknown): void {
    try { ui.notifications?.error?.(`${game.i18n.localize(messageKey)}: ${String(error)}`); }
    catch { /* A failed notification must not create a second unhandled rejection. */ }
  }
  try { void Promise.resolve(action()).catch(report); }
  catch (error) { report(error); }
}
