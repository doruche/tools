/** Showing SVG source: re-indenting it, and splitting it into highlighted lines. */

const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const escapeAttribute = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
    .replaceAll('\n', '&#10;').replaceAll('\r', '&#13;').replaceAll('\t', '&#9;');

function startTag(element: Element) {
  let tag = `<${element.nodeName}`;
  for (let i = 0; i < element.attributes.length; i++) {
    const { name, value } = element.attributes[i];
    tag += ` ${name}="${escapeAttribute(value)}"`;
  }
  return tag;
}

/** A node written out on as few lines as its own text allows. */
function inline(node: Node): string {
  switch (node.nodeType) {
    case 1: {
      const element = node as Element;
      const children = Array.from(element.childNodes, inline).join('');
      return children ? `${startTag(element)}>${children}</${element.nodeName}>` : `${startTag(element)}/>`;
    }
    case 3: return escapeText(node.nodeValue ?? '');
    case 4: return `<![CDATA[${node.nodeValue}]]>`;
    case 7: return `<?${(node as ProcessingInstruction).target} ${node.nodeValue}?>`;
    case 8: return `<!--${node.nodeValue}-->`;
    case 10: {
      const { name, publicId, systemId } = node as DocumentType;
      if (publicId) return `<!DOCTYPE ${name} PUBLIC "${publicId}" "${systemId}">`;
      return systemId ? `<!DOCTYPE ${name} SYSTEM "${systemId}">` : `<!DOCTYPE ${name}>`;
    }
    default: return '';
  }
}

const blank = (node: Node) => node.nodeType === 3 && !/\S/.test(node.nodeValue ?? '');

/**
 * The document re-indented with two spaces, one element per line. An element
 * holding text, such as <text> or <style>, is written as it is, because
 * whitespace inside it can change what it shows.
 */
export function pretty(doc: Document) {
  const lines: string[] = [];
  const write = (node: Node, depth: number) => {
    const indent = '  '.repeat(depth);
    if (node.nodeType !== 1) {
      if (!blank(node)) lines.push(indent + inline(node).trim());
      return;
    }
    const element = node as Element;
    const children = Array.from(element.childNodes).filter(child => !blank(child));
    const holdsText = children.some(child => child.nodeType === 3 || child.nodeType === 4);
    if (!children.length) lines.push(`${indent}${startTag(element)}/>`);
    else if (holdsText) lines.push(indent + inline(element));
    else {
      lines.push(`${indent}${startTag(element)}>`);
      for (const child of children) write(child, depth + 1);
      lines.push(`${indent}</${element.nodeName}>`);
    }
  };
  for (const node of Array.from(doc.childNodes)) write(node, 0);
  return lines.join('\n');
}

export type Kind = 'text' | 'punct' | 'tag' | 'attr' | 'value' | 'comment' | 'meta';
export type Token = { kind: Kind; text: string };

// Outside a tag: comments, CDATA, <? ?> and <! > declarations, the start of a tag, or text.
const outside = /(<!--[\s\S]*?(?:-->|$))|(<!\[CDATA\[[\s\S]*?(?:\]\]>|$))|(<[?!][\s\S]*?(?:>|$))|(<\/?)([^\s/>]*)|([^<]+)|(<)/y;
// Inside a tag: whitespace, an attribute name, =, a quoted value, or the end of the tag.
const inside = /(\s+)|([^\s=/>"']+)|(=)|("[^"]*"?|'[^']*'?)|(\/?>)|([\s\S])/y;

/** Splits XML source into lines of tokens for highlighting; joined back, it is the source again, apart from line endings. */
export function highlight(source: string): Token[][] {
  const tokens: Token[] = [];
  const push = (kind: Kind, text: string) => { if (text) tokens.push({ kind, text }); };
  let at = 0;
  while (at < source.length) {
    outside.lastIndex = at;
    const m = outside.exec(source)!;
    at = outside.lastIndex;
    if (m[1]) push('comment', m[1]);
    else if (m[2] || m[3]) push('meta', m[2] || m[3]);
    else if (m[4]) {
      push('punct', m[4]);
      push('tag', m[5]);
      // Read attributes until the tag closes.
      while (at < source.length) {
        inside.lastIndex = at;
        const a = inside.exec(source)!;
        at = inside.lastIndex;
        if (a[1]) push('text', a[1]);
        else if (a[2]) push('attr', a[2]);
        else if (a[3]) push('punct', a[3]);
        else if (a[4]) push('value', a[4]);
        else if (a[5]) { push('punct', a[5]); break; }
        else push('text', a[6]);
      }
    } else push('text', m[6] || m[7]);
  }

  // Tokens may span lines; split them so each line can be its own list item.
  const lines: Token[][] = [[]];
  for (const { kind, text } of tokens) {
    text.split(/\r?\n/).forEach((part, index) => {
      if (index) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind, text: part });
    });
  }
  return lines;
}
