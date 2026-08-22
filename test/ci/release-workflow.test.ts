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

  it('keeps manual release runs read-only with respect to tags', () => {
    const versionIndex = workflow.indexOf('- name: Get version')
    const tagCheckIndex = workflow.indexOf('- name: Verify manual release tag exists')
    const releaseIndex = workflow.indexOf('- name: Create Draft Release')

    expect(workflow).toContain('Verify manual release tag exists')
    expect(workflow).toContain('git ls-remote --exit-code --tags origin')
    expect(workflow).toContain('no tag will be created or pushed')
    expect(workflow).not.toMatch(/^\s+git (?:tag|push)\b/m)
    expect(versionIndex).toBeLessThan(tagCheckIndex)
    expect(tagCheckIndex).toBeLessThan(releaseIndex)
  })

  it('binds a manual release to the commit referenced by its remote tag', () => {
    expect(workflow).toContain('refs/tags/$RELEASE_VERSION^{}')
    expect(workflow).toContain('CHECKOUT_SHA=$(git rev-parse HEAD)')
    expect(workflow).toContain('[[ "$REMOTE_TAG_SHA" != "$CHECKOUT_SHA" ]]')
    expect(workflow).toContain('Tag $RELEASE_VERSION points to $REMOTE_TAG_SHA')
    expect(workflow).toContain('Dispatch the workflow from the tagged commit.')
  })

  it('does not let store-only dispatches enter the release job', () => {
    expect(workflow).toContain("github.event.inputs.version != 'store'")
    expect(workflow).toContain("github.event.inputs.version != 'mac-store'")
    expect(workflow).toContain("github.event.inputs.version != 'linux-store'")
    expect(workflow).toContain("github.event.inputs.version != 'linux-store-build'")
  })
})
