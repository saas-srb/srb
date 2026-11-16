/**
 * What counts as "a recognised access check" in a route handler or a server-action file. Pure text patterns (used by the guard sweep test and the audit).
 * A file that matches none of these must be listed in `route-guard-allowlist.ts` with a reason.
 */
export const GUARD_PATTERN = new RegExp(
  [
    String.raw`\brequire[A-Z]\w*\(`,                                  // requireViewer(), requireLms(), requireWorkspaceAction(), requireAccess(), ...
    String.raw`\brequire\w*(?:User|Access|Action|Session|Staff|Admin|Permission|Viewer|Actor|Employee)\w*\(`,
    String.raw`\bgetPbActor\(`, String.raw`\bgetViewer\(`, String.raw`\bresolveViewer\(`, String.raw`\bsenderViewer\(`,
    String.raw`\brun\(\s*\[`,                                        // ViralPulse: run(["FEATURE"], ...) resolves the viewer and checks the feature
    String.raw`\bcan[A-Z]\w*\(`, String.raw`\w+Can\(`, String.raw`\bcan\(`,
    String.raw`\bhas\w+(?:Access|Role)\w*\(`, String.raw`resolvePermission\(`, String.raw`isAuthorized\w*\(`,
    String.raw`getSession\w+\(`, String.raw`getCurrent\w*User\(`,
    String.raw`verify\w+(?:Token|Signature|Secret)\w*\(`, String.raw`hasBearer\(`, String.raw`cronRoute\(`,
    String.raw`withTransport\(`, String.raw`authorize\w*\(`, String.raw`\bcheckPlatformPermission\(`, String.raw`\bassert\w*Access\w*\(`,
  ].join("|"),
);

export const hasRecognisedGuard = (source: string): boolean => GUARD_PATTERN.test(source);
