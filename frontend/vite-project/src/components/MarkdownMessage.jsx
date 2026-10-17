import React from 'react'

function normalizeMarkdown(value) {
  return String(value || '')
    .replace(/\\<br\s*\/?\s*>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/\\([*_`|])/g, '$1')
    .replace(/\\-{2,}/g, (match) => match.slice(1))
}

function inlineContent(text, keyPrefix) {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|(?<!\*)\*[^*]+\*(?!\*))/g
  const nodes = []
  let cursor = 0
  let match
  let index = 0

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={`${keyPrefix}-${index}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (link) nodes.push(<a key={`${keyPrefix}-${index}`} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>)
      else nodes.push(token)
    } else {
      nodes.push(<em key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</em>)
    }
    cursor = pattern.lastIndex
    index += 1
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isTableDivider(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function isBlockStart(lines, index) {
  const line = lines[index]
  return /^\s*```/.test(line) || /^#{1,6}\s/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || /^\s*>/.test(line) || (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1]))
}

export default function MarkdownMessage({ content }) {
  const lines = normalizeMarkdown(content).replace(/\r/g, '').split('\n')
  const blocks = []
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }

    if (/^\s*```/.test(line)) {
      const code = []
      index += 1
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index += 1
      blocks.push(<pre key={key++}><code>{code.join('\n')}</code></pre>)
      continue
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (heading) {
      const Tag = `h${heading[1].length}`
      blocks.push(<Tag key={key++}>{inlineContent(heading[2], `h${key}`)}</Tag>)
      index += 1
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = tableCells(line)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(tableCells(lines[index++]))
      blocks.push(<div className="ai-markdown-table-wrap" key={key++}><table><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineContent(cell, `th${key}-${cellIndex}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inlineContent(row[cellIndex] || '', `td${key}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }

    const unordered = /^\s*[-*+]\s+/.test(line)
    const ordered = /^\s*\d+[.)]\s+/.test(line)
    if (unordered || ordered) {
      const Tag = ordered ? 'ol' : 'ul'
      const items = []
      while (index < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(lines[index]) : /^\s*[-*+]\s+/.test(lines[index]))) {
        items.push(lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(<Tag key={key++}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item, `li${key}-${itemIndex}`)}</li>)}</Tag>)
      continue
    }

    if (/^\s*>/.test(line)) {
      const quote = []
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''))
      blocks.push(<blockquote key={key++}>{quote.map((text, quoteIndex) => <p key={quoteIndex}>{inlineContent(text, `q${key}-${quoteIndex}`)}</p>)}</blockquote>)
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) paragraph.push(lines[index++])
    blocks.push(<p key={key++}>{paragraph.map((text, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br />}{inlineContent(text, `p${key}-${lineIndex}`)}</React.Fragment>)}</p>)
  }

  return <div className="ai-markdown-content">{blocks}</div>
}
