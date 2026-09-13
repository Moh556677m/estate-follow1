import React, { useRef, useEffect } from 'react';
import {
  Bold, Italic, List, ListOrdered, Quote, Link2, Heading1, Heading2, Heading3,
  Undo2, Redo2, Table as TableIcon, Image as ImageIcon, Video, MessageSquareWarning,
} from 'lucide-react';

// Lightweight rich text editor using contenteditable + execCommand.
// Outputs HTML stored in the `editor` field. Headings get an auto id for TOC.
// Supports: H1/H2/H3, bold, italic, lists, quotes, links, tables, callout
// boxes, inline images (URL), video embeds, undo/redo.
const RichTextEditor = ({ value, onChange, placeholder }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command, arg) => {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    emit();
  };

  const addLink = () => {
    const url = window.prompt('https://');
    if (url) {
      document.execCommand('createLink', false, url);
      emit();
    }
  };

  const addImage = () => {
    const url = window.prompt('Image URL (https://...)');
    if (url) {
      document.execCommand('insertHTML', false, `<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:0.75rem;margin:1.2em 0;" />`);
      emit();
    }
  };

  const addVideo = () => {
    const url = window.prompt('YouTube / Vimeo URL');
    if (!url) return;
    let embed = '';
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
    else if (vimeo) embed = `https://player.vimeo.com/video/${vimeo[1]}`;
    else embed = url;
    document.execCommand(
      'insertHTML',
      false,
      `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:0.75rem;margin:1.2em 0;"><iframe src="${embed}" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allowfullscreen frameborder="0"></iframe></div>`,
    );
    emit();
  };

  const addTable = () => {
    const rows = Number(window.prompt('Number of rows?', '3') || '3');
    const cols = Number(window.prompt('Number of columns?', '3') || '3');
    if (!rows || !cols) return;
    let html = '<table><thead><tr>';
    for (let c = 0; c < cols; c++) html += '<th>Header</th>';
    html += '</tr></thead><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += '<td>Cell</td>';
      html += '</tr>';
    }
    html += '</tbody></table><p><br/></p>';
    document.execCommand('insertHTML', false, html);
    emit();
  };

  const addCallout = () => {
    document.execCommand(
      'insertHTML',
      false,
      `<div class="ef-callout" style="border-inline-start:4px solid hsl(var(--primary));background:hsl(var(--muted));padding:1rem 1.25rem;border-radius:0.5rem;margin:1.2em 0;"><strong>💡 Callout:</strong> Write your highlighted note here...</div><p><br/></p>`,
    );
    emit();
  };

  const emit = () => {
    if (!ref.current) return;
    // Add ids to headings for TOC extraction.
    ref.current.querySelectorAll('h2, h3').forEach((h) => {
      if (!h.id) {
        const txt = (h.textContent || '').trim().toLowerCase().replace(/[^\w\u0600-\u06FF]+/g, '-').replace(/^-|-$/g, '');
        h.id = txt || 'section-' + Math.random().toString(36).slice(2, 7);
      }
    });
    onChange?.(ref.current.innerHTML);
  };

  const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors';

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-1.5">
        <button type="button" className={btn} onClick={() => exec('formatBlock', 'H1')} title="H1"><Heading1 size={16} /></button>
        <button type="button" className={btn} onClick={() => exec('formatBlock', 'H2')} title="H2"><Heading2 size={16} /></button>
        <button type="button" className={btn} onClick={() => exec('formatBlock', 'H3')} title="H3"><Heading3 size={16} /></button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec('bold')} title="Bold"><Bold size={16} /></button>
        <button type="button" className={btn} onClick={() => exec('italic')} title="Italic"><Italic size={16} /></button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={16} /></button>
        <button type="button" className={btn} onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={16} /></button>
        <button type="button" className={btn} onClick={() => exec('formatBlock', 'BLOCKQUOTE')} title="Quote"><Quote size={16} /></button>
        <button type="button" className={btn} onClick={addLink} title="Link"><Link2 size={16} /></button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={btn} onClick={addTable} title="Table"><TableIcon size={16} /></button>
        <button type="button" className={btn} onClick={addCallout} title="Callout box"><MessageSquareWarning size={16} /></button>
        <button type="button" className={btn} onClick={addImage} title="Image (URL)"><ImageIcon size={16} /></button>
        <button type="button" className={btn} onClick={addVideo} title="Video embed"><Video size={16} /></button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec('undo')} title="Undo"><Undo2 size={16} /></button>
        <button type="button" className={btn} onClick={() => exec('redo')} title="Redo"><Redo2 size={16} /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="ef-editor min-h-[300px] max-w-none p-4 prose prose-sm dark:prose-invert focus:outline-none prose-headings:scroll-mt-20 prose-a:text-primary"
      />
    </div>
  );
};

export default RichTextEditor;
