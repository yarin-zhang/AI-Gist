import { describe, expect, it } from 'vitest'
import { buildAISummaryPrompt, parseAISummaryResponse } from '../src/renderer/lib/utils/ai-summary'

describe('buildAISummaryPrompt', () => {
  it('embeds the prompt content and asks for a strict JSON reply', () => {
    const instruction = buildAISummaryPrompt('Write a haiku about the ocean')

    expect(instruction).toContain('Write a haiku about the ocean')
    expect(instruction).toContain('{"title": "...", "description": "..."}')
    expect(instruction.toLowerCase()).toContain('same language')
  })
})

describe('parseAISummaryResponse', () => {
  it('parses a well-formed JSON reply', () => {
    const result = parseAISummaryResponse('{"title": "Ocean Haiku", "description": "A short poem about the sea"}')
    expect(result).toEqual({ title: 'Ocean Haiku', description: 'A short poem about the sea' })
  })

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw = '```json\n{"title": "海洋俳句", "description": "描写海洋的一首短诗"}\n```'
    expect(parseAISummaryResponse(raw)).toEqual({ title: '海洋俳句', description: '描写海洋的一首短诗' })
  })

  it('parses JSON with surrounding chatter and nested braces in the description', () => {
    const raw = 'Sure! Here you go:\n{"title": "Config Helper", "description": "Explains {{variable}} usage"} Hope that helps.'
    expect(parseAISummaryResponse(raw)).toEqual({
      title: 'Config Helper',
      description: 'Explains {{variable}} usage',
    })
  })

  it('skips unmatched decorative braces that appear before the real JSON object', () => {
    const raw = 'noise {{{not real}}} then real: {"title": "Real Title", "description": "..."}'
    expect(parseAISummaryResponse(raw)).toEqual({
      title: 'Real Title',
      description: '...',
    })
  })

  it('skips a Jinja-style {{variable}} mention that appears before the real JSON object', () => {
    const raw = 'Sure! For a template using {{name}} style variables, here is the summary: {"title": "Placeholder Helper", "description": "..."}'
    expect(parseAISummaryResponse(raw)).toEqual({
      title: 'Placeholder Helper',
      description: '...',
    })
  })

  it('truncates overly long fields instead of writing runaway text into the form', () => {
    const longTitle = 'A'.repeat(120)
    const raw = JSON.stringify({ title: longTitle, description: 'ok' })
    const result = parseAISummaryResponse(raw)
    expect(result.title.length).toBeLessThanOrEqual(60)
    expect(result.title.endsWith('…')).toBe(true)
  })

  it('falls back to using a short plain-text reply as the title', () => {
    const result = parseAISummaryResponse('  Ocean Haiku Generator  ')
    expect(result).toEqual({ title: 'Ocean Haiku Generator', description: '' })
  })

  it('throws when the response is empty', () => {
    expect(() => parseAISummaryResponse('')).toThrow()
    expect(() => parseAISummaryResponse('   ')).toThrow()
  })

  it('throws when the response has no usable title and is not valid JSON', () => {
    expect(() => parseAISummaryResponse('{not json at all')).toThrow()
  })

  it('throws when JSON is well-formed but missing a usable title', () => {
    expect(() => parseAISummaryResponse('{"description": "only a description"}')).toThrow()
  })
})
