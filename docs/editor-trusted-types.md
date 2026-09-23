# Editor Trusted Types (GRAV-22)

## Browser support and API requirements

Research checked on September 23, 2026. MDN's browser compatibility data lists
`TrustedTypePolicyFactory.createPolicy()` support in Chrome/Edge 83+, Firefox
148+, and Safari/iOS Safari 26+. Older browsers still need the sanitized-string
fallback. Detect the API rather than the browser name.

Sources: [MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/TrustedTypePolicyFactory.json),
[createPolicy API](https://developer.mozilla.org/en-US/docs/Web/API/TrustedTypePolicyFactory/createPolicy),
[CSP enforcement](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/require-trusted-types-for),
and [DOMPurify Trusted Types guidance](https://github.com/cure53/DOMPurify#what-about-dompurify-and-trusted-types).

Creating a policy alone does not enable browser enforcement. The production
HTML response must include both directives (already enforced by Gravity):

```http
Content-Security-Policy: ...; trusted-types gravity-editor dompurify ProseMirrorClipboard; require-trusted-types-for 'script'
```

The policy-name allowlist in `client/nginx.template.conf` and `server/src/app.ts`
must stay aligned. There is no default policy or permission for duplicate names:
raw string assignments remain errors in supporting browsers.

## Implementation and sink audit

`library/utilities/sanitize.ts` owns the lazy `gravity-editor` policy.
`sanitizeTrustedHtml()` calls its `createHTML()` method, whose callback calls the
shared `sanitizeHtml()` function. DOMPurify receives `RETURN_TRUSTED_TYPE: false`
so the callback returns a sanitized string for the browser to wrap in TrustedHTML.
The shared tag, attribute, URI, and external-link rules apply to both paths.
Horizontal rules and ordered-list start numbers are allowed to preserve these
supported editor structures; the `start` attribute is scoped to `ol` elements.
Only signed decimal integers within the HTML signed 32-bit range are retained;
malformed or out-of-range values are removed so ProseMirror defaults to `1`.

The private policy is reused on subsequent calls and across Vite hot updates.
Its callback uses the current sanitizer after an update. A CSP rejection or
duplicate-policy error propagates; it never silently switches to a string.
Without `window.trustedTypes.createPolicy`, the helper returns the same sanitized
HTML as a string. Its declared return type reflects both outcomes.

DOMPurify still needs its internal `dompurify` policy for parsing under CSP.
Do not configure it to use `gravity-editor` as `TRUSTED_TYPES_POLICY`: that would
make sanitization recursively call itself.

| HTML assignment | Protection |
| --- | --- |
| `useRichTextEditor.ts`: clipboard container `innerHTML` | `sanitizeTrustedHtml()`; preserve the TrustedHTML object at assignment |
| `MarkdownContent.tsx`: rendered-content template `innerHTML` | `sanitizeTrustedHtml()`; preserve the TrustedHTML object at assignment |
| ProseMirror dependency: clipboard/drop parser `innerHTML` | `sanitizeRichTextClipboardHtml()` sanitizes before ProseMirror uses its own `ProseMirrorClipboard` policy |

These are the two app-owned `innerHTML` writes in the editor/rendering code.
`renderRichTextHtml()` reads serialized DOM through `innerHTML` and sanitizes its
output; it does not assign HTML. `MarkdownEditor` delegates multiline editing to
`RichTextEditor` and uses a text input for its single-line mode.

When clipboard HTML sanitizes to nothing, the paste event is consumed. Available
`text/plain` is passed through ProseMirror's text parser; rejected HTML is never
retried. The transform hook also covers programmatic `pasteHTML()` and HTML drops.

The clipboard-only sanitizer retains `data-pm-slice` to preserve paragraph
boundaries and repeated spaces across editors. Metadata length and depth are
bounded; only known structural wrappers and validated list numbers are accepted.
The sanitized DOM is parsed against the editor schema, and every reconstructed
context wrapper must admit its partial content. Invalid metadata is discarded.
Generic HTML sanitization and the `gravity-editor` policy still remove all data
attributes, including clipboard metadata.

## Verification

```sh
npm run -w client test -- src/test/utilities/sanitize.test.ts src/test/utilities/richtext-paste-xss.test.ts src/test/utilities/richtext-clipboard.test.ts src/test/components/RichTextEditor.test.tsx
npm run -w server test -- tests/create-app.test.ts
npm run -w client install:production-csp-browser
npm run -w client test:editor-trusted-types
npm run -w client build
```

The standalone browser test builds the real editor and renderer into a production
fixture and serves it with enforcing CSP. It checks browser rejection of raw HTML,
genuine TrustedHTML output, XSS removal, and editor/rendering behavior. Its separate
fallback run hides the API before application startup and omits Trusted Types CSP;
this simulates an older browser without claiming native coverage of older engines.
Chromium runs by default. After installing additional Playwright browsers, set
`GRAVITY_TT_TEST_BROWSERS=chromium,firefox` (or include `webkit`) to run the same
checks in multiple engines.

The existing `test:production-csp` command additionally exercises the complete
deployed application with `GRAVITY_CSP_TEST_URL` pointing to a disposable test
instance. It creates account/workspace fixtures. `scripts/local-ci.sh` runs both
browser checks after installing Chromium.
