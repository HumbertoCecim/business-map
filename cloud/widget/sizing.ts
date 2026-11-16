import type { App } from '@modelcontextprotocol/ext-apps';

export const WIDGET_VERSION = '0.1.2';

/** Report our inline design height, never a measurement of a host-controlled document. */
export function bindWidgetSizing(app: Pick<App, 'getHostContext' | 'sendSizeChanged' | 'addEventListener' | 'removeEventListener'>) {
  let reported: number | undefined;
  const report = () => {
    // The host owns fullscreen dimensions. Reporting its viewport back would create a loop.
    if (app.getHostContext()?.displayMode === 'fullscreen') { reported = undefined; return; }
    const height = window.matchMedia('(max-width:700px)').matches ? 560 : 600;
    if (height === reported) return;
    reported = height;
    void app.sendSizeChanged({ height }).catch(() => { reported = undefined; });
  };
  app.addEventListener('hostcontextchanged', report);
  window.addEventListener('resize', report);
  report();
  return () => { app.removeEventListener('hostcontextchanged', report); window.removeEventListener('resize', report); };
}
