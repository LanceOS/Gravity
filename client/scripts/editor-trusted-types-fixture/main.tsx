import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { RichTextEditor } from '../../../library/components/richtext/RichTextEditor';
import { useRichTextEditor } from '../../../library/components/richtext/hooks/useRichTextEditor';
import { sanitizeTrustedHtml } from '../../../library/utilities/sanitize';
import { parseRichTextValue, serializeRichTextJson } from '../../../library/utilities/richtext';
import { MarkdownContent } from '../../src/modules/tickets/components/MarkdownContent';
import { ProjectContext } from '../../src/context/project/ProjectContext';
import type { ProjectContextType } from '../../src/context/project/ProjectContext.types';

// Exercise the real components without mounting API-backed application providers.
// No ticket references are present, so MarkdownContent only reads `projects`.
const projectContext = { projects: [] } as unknown as ProjectContextType;
const renderedDocument = JSON.stringify({
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Rendered bold', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' unsafe link', marks: [{ type: 'link', attrs: { href: 'javascript:window.__editorXss = true' } }] },
    ],
  }],
});

const testApi = { sanitizeTrustedHtml };
Object.assign(window, { __editorTrustedTypesTest: testApi });

function ProgrammaticPasteFixture() {
  const { mountRef, view } = useRichTextEditor({ value: '', onChange: () => {} });
  useEffect(() => {
    Object.assign(testApi, { pasteHTML: (html: string) => view?.pasteHTML(html) });
  }, [view]);
  return <section data-testid="programmatic-editor"><div ref={mountRef} /></section>;
}

function ClipboardDropFixture() {
  const source = useRichTextEditor({ value: 'a  b', onChange: () => {} });
  const target = useRichTextEditor({ value: 'AB', onChange: () => {} });
  useEffect(() => {
    const sourceView = source.view;
    const targetView = target.view;
    if (!sourceView || !targetView) return;
    Object.assign(testApi, {
      copySelection: (closed: boolean) => {
        const selection = closed
          ? NodeSelection.create(sourceView.state.doc, 0)
          : TextSelection.create(sourceView.state.doc, 1, sourceView.state.doc.content.size - 1);
        sourceView.dispatch(sourceView.state.tr.setSelection(selection));
        const { dom, text } = sourceView.serializeForClipboard(selection.content());
        return { html: dom.innerHTML, text };
      },
      dropHTML: (html: string, text = '') => {
        targetView.dispatch(targetView.state.tr.replaceWith(
          0, targetView.state.doc.content.size, parseRichTextValue('AB').content,
        ));
        targetView.dom.scrollIntoView();
        const coords = targetView.coordsAtPos(2);
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/html', html);
        dataTransfer.setData('text/plain', text);
        const event = new DragEvent('drop', {
          bubbles: true, cancelable: true, dataTransfer,
          clientX: coords.left, clientY: (coords.top + coords.bottom) / 2,
        });
        targetView.dom.dispatchEvent(event);
        const doc = targetView.state.doc;
        // Validation plus a save/reload round-trip catches invalid attributes
        // that JSON.stringify would otherwise silently convert to null.
        doc.check();
        const serialized = serializeRichTextJson(doc);
        const reloaded = parseRichTextValue(serialized);
        reloaded.check();
        return {
          prevented: event.defaultPrevented,
          document: doc.toJSON(),
          serialized,
          reloaded: serializeRichTextJson(reloaded),
        };
      },
      pasteAndReload: (html: string) => {
        targetView.dispatch(targetView.state.tr.replaceWith(
          0, targetView.state.doc.content.size, parseRichTextValue('').content,
        ));
        targetView.dispatch(targetView.state.tr.setSelection(TextSelection.atStart(targetView.state.doc)));
        targetView.pasteHTML(html);
        targetView.state.doc.check();
        const serialized = serializeRichTextJson(targetView.state.doc);
        const reloaded = parseRichTextValue(serialized);
        reloaded.check();
        targetView.dispatch(targetView.state.tr.replaceWith(0, targetView.state.doc.content.size, reloaded.content));
        return { serialized, reloaded: serializeRichTextJson(targetView.state.doc) };
      },
    });
  }, [source.view, target.view]);
  return <>
    <section data-testid="drop-source"><div ref={source.mountRef} /></section>
    <section data-testid="drop-target"><div ref={target.mountRef} /></section>
  </>;
}

function Fixture() {
  const [value, setValue] = useState('');
  return (
    <ProjectContext.Provider value={projectContext}>
      <RichTextEditor value={value} onChange={setValue} placeholder="" />
      <ProgrammaticPasteFixture />
      <ClipboardDropFixture />
      <section data-testid="rendered-content"><MarkdownContent text={renderedDocument} /></section>
      <output data-testid="serialized-value">{value}</output>
    </ProjectContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>);
