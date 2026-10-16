import { Fragment } from 'react'
import './JobSkills.css'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function skillPattern(skill, global = false) {
  return new RegExp(`(^|[^a-z0-9])(${escapeRegExp(skill)})(?=$|[^a-z0-9])`, global ? 'gi' : 'i')
}

export function HighlightedText({ text, skills }) {
  if (!text) return null
  const ranges = []
  for (const skill of skills) {
    const pattern = skillPattern(skill, true)
    let match
    while ((match = pattern.exec(text))) {
      const start = match.index + match[1].length
      ranges.push({ start, end: start + match[2].length })
      if (match[0].length === 0) pattern.lastIndex += 1
    }
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end)
  const nonOverlapping = []
  for (const range of ranges) {
    if (!nonOverlapping.length || range.start >= nonOverlapping[nonOverlapping.length - 1].end) nonOverlapping.push(range)
  }
  if (!nonOverlapping.length) return text

  const pieces = []
  let cursor = 0
  for (const [index, range] of nonOverlapping.entries()) {
    if (range.start > cursor) pieces.push(<Fragment key={`text-${index}`}>{text.slice(cursor, range.start)}</Fragment>)
    pieces.push(<mark className="required-skill-highlight" key={`skill-${index}`}>{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  }
  if (cursor < text.length) pieces.push(<Fragment key="text-end">{text.slice(cursor)}</Fragment>)
  return pieces
}

export function SkillBadges({ skills }) {
  if (!skills.length) return <span className="job-skills-empty">No specific skills identified in the listing.</span>
  return <div className="job-skill-badges">{skills.map((skill) => <span className="job-skill-badge" key={skill}>{skill}</span>)}</div>
}
