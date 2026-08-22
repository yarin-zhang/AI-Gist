import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/build-release.yml'),
  'utf8',
)

describe('release workflow trigger contract', () => {
  it('publishes automatically only for version tags', () => {
    expect(workflow).toContain("tags:\n      - 'v*.*.*'")
    expect(workflow).not.toContain('branches:\n      - main')
  })

  it('derives the release version from the pushed tag', () => {
    expect(workflow).toContain('TAG_VERSION: ${{ github.ref_name }}')
    expect(workflow).toContain('if [[ "$EVENT_NAME" == "push" ]]; then')
    expect(workflow).toContain('VERSION="$TAG_VERSION"')
  })

  it('does not create a second tag from a tag-triggered run', () => {
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'")
  })
})
